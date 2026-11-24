import type { ScenarioProgressRecord } from '../scenarios/scenario-service';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LanguageId } from '@pracstack/content-model';
import type {
  AccountStore,
  CreateSessionOutcome,
  DraftRecord,
  EntitlementRecord,
  IdentityRecord,
  ImportRecord,
  InterviewSessionRecord,
  LinkIntentRecord,
  PreparationRecord,
  ProfileRecord,
  QuestionMarkRecord,
  SavedCompanyRecord,
  SavedPlanRecord,
} from './account-store';
import { documentClient, type DynamoStoreOptions } from './dynamo-store';

/*
 * Account records in the same table as progress (`pk`/`sk`, TTL `ttl`):
 *
 *   pk                         sk                            item
 *   USER#<user>                ACCOUNT                       { data: ProfileRecord }
 *   USER#<user>                ENTITLEMENT                   { data: EntitlementRecord }
 *   USER#<user>                IDENTITY#<provider>#<subject> { data: IdentityRecord }   (listing)
 *   IDENTITY#<provider>#<sub>  IDENTITY                      { data: IdentityRecord }   (lookup)
 *   LINK#<token>               LINK                          { data, usedAt }          (TTL)
 *   USER#<user>                SAVED#<company>               { data: SavedCompanyRecord }
 *   USER#<user>                MARK#<company>#<question>     { data: QuestionMarkRecord }
 *   USER#<user>                ISESSION#<id>                 { revision, data }
 *   USER#<user>                ISREQ#<clientRequestId>       { sessionId }             (idempotency)
 *   USER#<user>                DRAFT#<challenge>#<language>  { data: DraftRecord }
 *   USER#<user>                IMPORT#<importId>             { data: ImportRecord }    (TTL 30 days)
 *   USER#<user>                PREP                          { targetRoleId?, plans, updatedAt }
 *   USER#<user>                SCENARIO#<scenario>           { data: ScenarioProgressRecord }
 *
 * PREP keeps its fields at the top level (not under `data`) so that adding a
 * plan is one conditional UpdateItem: `list_append` guarded by
 * `size(plans) < max`, which enforces the plan limit atomically. Removing a
 * plan removes its list index with a condition on that index's id, retried
 * if the list changed in between. Plans hold taxonomy term ids only.
 *
 * Everything a user owns stays in their partition (single-Query listings, and
 * a session can only be read through its owner's key). Identity lookups use
 * their own item so a sign-in resolves with one GetItem.
 */

const user = (userId: string) => `USER#${userId}`;
const DAY_S = 24 * 60 * 60;
const IMPORT_TTL_S = 30 * DAY_S;

export class DynamoAccountStore implements AccountStore {
  private readonly db: DynamoDBDocumentClient;
  private readonly table: string;

  constructor(options: DynamoStoreOptions) {
    this.table = options.tableName;
    this.db = documentClient(options.client ?? new DynamoDBClient({}));
  }

  async getProfile(userId: string): Promise<ProfileRecord | undefined> {
    return this.data<ProfileRecord>(user(userId), 'ACCOUNT');
  }

  async putProfile(profile: ProfileRecord): Promise<void> {
    await this.put(user(profile.userId), 'ACCOUNT', { data: profile });
  }

  async getEntitlement(userId: string): Promise<EntitlementRecord | undefined> {
    return this.data<EntitlementRecord>(user(userId), 'ENTITLEMENT');
  }

  async putEntitlement(entitlement: EntitlementRecord): Promise<void> {
    await this.put(user(entitlement.userId), 'ENTITLEMENT', { data: entitlement });
  }

  async getIdentity(provider: string, subject: string): Promise<IdentityRecord | undefined> {
    return this.data<IdentityRecord>(`IDENTITY#${provider}#${subject}`, 'IDENTITY');
  }

  async putIdentityIfAbsent(identity: IdentityRecord): Promise<IdentityRecord> {
    const lookup = `IDENTITY#${identity.provider}#${identity.subject}`;
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: { pk: lookup, sk: 'IDENTITY', data: identity },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: user(identity.userId),
                  sk: `IDENTITY#${identity.provider}#${identity.subject}`,
                  data: identity,
                },
              },
            },
          ],
        }),
      );
      return identity;
    } catch (err) {
      if (!(err instanceof TransactionCanceledException)) throw err;
      const existing = await this.getIdentity(identity.provider, identity.subject);
      if (!existing) throw err;
      return existing;
    }
  }

  async replaceIdentity(identity: IdentityRecord, previousUserId: string): Promise<boolean> {
    const sk = `IDENTITY#${identity.provider}#${identity.subject}`;
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: `IDENTITY#${identity.provider}#${identity.subject}`,
                  sk: 'IDENTITY',
                  data: identity,
                },
                ConditionExpression: '#d.userId = :previous',
                ExpressionAttributeNames: { '#d': 'data' },
                ExpressionAttributeValues: { ':previous': previousUserId },
              },
            },
            { Delete: { TableName: this.table, Key: { pk: user(previousUserId), sk } } },
            {
              Put: {
                TableName: this.table,
                Item: { pk: user(identity.userId), sk, data: identity },
              },
            },
          ],
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof TransactionCanceledException) return false;
      throw err;
    }
  }

  async listIdentities(userId: string): Promise<readonly IdentityRecord[]> {
    const items = await this.query(user(userId), 'IDENTITY#');
    return items
      .map((i) => i['data'] as IdentityRecord)
      .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt));
  }

  async putLinkIntent(intent: LinkIntentRecord): Promise<void> {
    await this.put(`LINK#${intent.token}`, 'LINK', {
      data: intent,
      ttl: Math.floor(Date.parse(intent.expiresAt) / 1000) + DAY_S,
    });
  }

  async consumeLinkIntent(token: string, at: string): Promise<LinkIntentRecord | undefined> {
    try {
      const res = await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: `LINK#${token}`, sk: 'LINK' },
          UpdateExpression: 'SET #d.usedAt = :at',
          ConditionExpression:
            'attribute_exists(pk) AND attribute_not_exists(#d.usedAt) AND #d.expiresAt > :at',
          ExpressionAttributeNames: { '#d': 'data' },
          ExpressionAttributeValues: { ':at': at },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes?.['data'] as LinkIntentRecord | undefined;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return undefined;
      throw err;
    }
  }

  async hasUserData(userId: string): Promise<boolean> {
    const res = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': user(userId) },
        Limit: 25,
        ConsistentRead: true,
      }),
    );
    // Identity items alone do not count as data.
    return (res.Items ?? []).some((i) => !String(i['sk']).startsWith('IDENTITY#'));
  }

  async saveCompany(record: SavedCompanyRecord): Promise<void> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { pk: user(record.userId), sk: `SAVED#${record.companyId}`, data: record },
          // Saving again keeps the original date.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
    }
  }

  async unsaveCompany(userId: string, companyId: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { pk: user(userId), sk: `SAVED#${companyId}` },
      }),
    );
  }

  async listSavedCompanies(userId: string): Promise<readonly SavedCompanyRecord[]> {
    const items = await this.query(user(userId), 'SAVED#');
    return items
      .map((i) => i['data'] as SavedCompanyRecord)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.companyId.localeCompare(b.companyId));
  }

  async setQuestionMark(
    record: Omit<QuestionMarkRecord, 'status'> & {
      status: QuestionMarkRecord['status'] | 'not-started';
    },
  ): Promise<void> {
    const sk = `MARK#${record.companyId}#${record.questionId}`;
    if (record.status === 'not-started') {
      await this.db.send(
        new DeleteCommand({ TableName: this.table, Key: { pk: user(record.userId), sk } }),
      );
    } else {
      await this.put(user(record.userId), sk, { data: record });
    }
  }

  async listQuestionMarks(userId: string): Promise<readonly QuestionMarkRecord[]> {
    const items = await this.query(user(userId), 'MARK#');
    return items.map((i) => i['data'] as QuestionMarkRecord);
  }

  async getScenarioProgress(
    userId: string,
    scenarioId: string,
  ): Promise<ScenarioProgressRecord | undefined> {
    const res = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: user(userId), sk: `SCENARIO#${scenarioId}` },
        ConsistentRead: true,
      }),
    );
    return res.Item?.['data'] as ScenarioProgressRecord | undefined;
  }

  async putScenarioProgress(record: ScenarioProgressRecord): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { pk: user(record.userId), sk: `SCENARIO#${record.scenarioId}`, data: record },
      }),
    );
  }

  async listScenarioProgress(userId: string): Promise<readonly ScenarioProgressRecord[]> {
    const items = await this.query(user(userId), 'SCENARIO#');
    return items.map((i) => i['data'] as ScenarioProgressRecord);
  }

  async getPreparation(userId: string): Promise<PreparationRecord | undefined> {
    const item = await this.get(user(userId), 'PREP');
    if (!item) return undefined;
    const targetRoleId = item['targetRoleId'];
    return {
      userId,
      ...(typeof targetRoleId === 'string' ? { targetRoleId } : {}),
      plans: (item['plans'] as SavedPlanRecord[] | undefined) ?? [],
      updatedAt: String(item['updatedAt'] ?? ''),
    };
  }

  async setTargetRole(userId: string, roleId: string | null, updatedAt: string): Promise<void> {
    await this.db.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { pk: user(userId), sk: 'PREP' },
        UpdateExpression: roleId
          ? 'SET targetRoleId = :role, updatedAt = :at'
          : 'SET updatedAt = :at REMOVE targetRoleId',
        ExpressionAttributeValues: { ':at': updatedAt, ...(roleId ? { ':role': roleId } : {}) },
      }),
    );
  }

  async addPreparationPlan(
    userId: string,
    plan: SavedPlanRecord,
    maxPlans: number,
    updatedAt: string,
  ): Promise<boolean> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: user(userId), sk: 'PREP' },
          UpdateExpression:
            'SET plans = list_append(if_not_exists(plans, :empty), :plan), updatedAt = :at',
          ConditionExpression: 'attribute_not_exists(plans) OR size(plans) < :max',
          ExpressionAttributeValues: {
            ':empty': [],
            ':plan': [plan],
            ':at': updatedAt,
            ':max': maxPlans,
          },
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return false;
      throw err;
    }
  }

  async updatePreparationPlan(
    userId: string,
    plan: SavedPlanRecord,
    updatedAt: string,
  ): Promise<boolean> {
    // The list can change between reading and writing; retry on a lost race.
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.getPreparation(userId);
      const index = current?.plans.findIndex((p) => p.id === plan.id) ?? -1;
      if (index < 0) return false;
      try {
        await this.db.send(
          new UpdateCommand({
            TableName: this.table,
            Key: { pk: user(userId), sk: 'PREP' },
            UpdateExpression: `SET plans[${index}] = :plan, updatedAt = :at`,
            ConditionExpression: `plans[${index}].#id = :id`,
            ExpressionAttributeNames: { '#id': 'id' },
            ExpressionAttributeValues: { ':plan': plan, ':id': plan.id, ':at': updatedAt },
          }),
        );
        return true;
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err;
      }
    }
    throw new Error('Could not update the plan: the list kept changing.');
  }

  async deletePreparationPlan(userId: string, planId: string, updatedAt: string): Promise<boolean> {
    // The list can change between reading and writing; retry on a lost race.
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.getPreparation(userId);
      const index = current?.plans.findIndex((p) => p.id === planId) ?? -1;
      if (index < 0) return false;
      try {
        await this.db.send(
          new UpdateCommand({
            TableName: this.table,
            Key: { pk: user(userId), sk: 'PREP' },
            UpdateExpression: `REMOVE plans[${index}] SET updatedAt = :at`,
            ConditionExpression: `plans[${index}].#id = :id`,
            ExpressionAttributeNames: { '#id': 'id' },
            ExpressionAttributeValues: { ':id': planId, ':at': updatedAt },
          }),
        );
        return true;
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err;
      }
    }
    throw new Error('Could not delete the plan: the list kept changing.');
  }

  async createInterviewSession(session: InterviewSessionRecord): Promise<CreateSessionOutcome> {
    const pk = user(session.userId);
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: { pk, sk: `ISREQ#${session.clientRequestId}`, sessionId: session.id },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk,
                  sk: `ISESSION#${session.id}`,
                  revision: session.revision,
                  data: session,
                },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
          ],
        }),
      );
      return { kind: 'created' };
    } catch (err) {
      if (!(err instanceof TransactionCanceledException)) throw err;
      const request = await this.get(pk, `ISREQ#${session.clientRequestId}`);
      const existing =
        typeof request?.['sessionId'] === 'string'
          ? await this.getInterviewSession(session.userId, request['sessionId'])
          : undefined;
      if (!existing) throw err;
      return { kind: 'existing', session: existing };
    }
  }

  async getInterviewSession(
    userId: string,
    sessionId: string,
  ): Promise<InterviewSessionRecord | undefined> {
    return this.data<InterviewSessionRecord>(user(userId), `ISESSION#${sessionId}`);
  }

  async updateInterviewSession(session: InterviewSessionRecord): Promise<boolean> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            pk: user(session.userId),
            sk: `ISESSION#${session.id}`,
            revision: session.revision,
            data: session,
          },
          ConditionExpression: 'revision = :expected',
          ExpressionAttributeValues: { ':expected': session.revision - 1 },
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return false;
      throw err;
    }
  }

  async listInterviewSessions(
    userId: string,
    limit: number,
  ): Promise<readonly InterviewSessionRecord[]> {
    // Session ids are random, so sort by start time after reading the (small) set.
    const items = await this.query(user(userId), 'ISESSION#');
    return items
      .map((i) => i['data'] as InterviewSessionRecord)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
      .slice(0, limit);
  }

  async getDraft(
    userId: string,
    challengeId: string,
    language: LanguageId,
  ): Promise<DraftRecord | undefined> {
    return this.data<DraftRecord>(user(userId), `DRAFT#${challengeId}#${language}`);
  }

  async putDraft(draft: DraftRecord): Promise<void> {
    await this.put(user(draft.userId), `DRAFT#${draft.challengeId}#${draft.language}`, {
      data: draft,
    });
  }

  async listDrafts(userId: string): Promise<readonly DraftRecord[]> {
    const items = await this.query(user(userId), 'DRAFT#');
    return items
      .map((i) => i['data'] as DraftRecord)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getImport(userId: string, importId: string): Promise<ImportRecord | undefined> {
    return this.data<ImportRecord>(user(userId), `IMPORT#${importId}`);
  }

  async putImportIfAbsent(record: ImportRecord): Promise<ImportRecord> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            pk: user(record.userId),
            sk: `IMPORT#${record.importId}`,
            data: record,
            ttl: Math.floor(Date.parse(record.importedAt) / 1000) + IMPORT_TTL_S,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return record;
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
      const existing = await this.getImport(record.userId, record.importId);
      if (!existing) throw err;
      return existing;
    }
  }

  // ---- helpers ----

  private async data<T>(pk: string, sk: string): Promise<T | undefined> {
    return (await this.get(pk, sk))?.['data'] as T | undefined;
  }

  private async get(pk: string, sk: string): Promise<Record<string, unknown> | undefined> {
    const res = await this.db.send(
      new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }),
    );
    return res.Item;
  }

  private async put(pk: string, sk: string, rest: Record<string, unknown>): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { pk, sk, ...rest } }));
  }

  private async query(pk: string, prefix: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const res = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
          ConsistentRead: true,
          ...(start ? { ExclusiveStartKey: start } : {}),
        }),
      );
      items.push(...(res.Items ?? []));
      start = res.LastEvaluatedKey;
    } while (start);
    return items;
  }
}
