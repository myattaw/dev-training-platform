# Java runner function (AWS Lambda container image). Built by the CDK from
# services/runners/dist/java. The handler (Node.js) supervises the Java
# harness in a separate, limited process.
FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6

RUN microdnf -y install util-linux java-21-amazon-corretto-devel && microdnf clean all

COPY harness/Harness.java /opt/harness/
RUN javac -d /opt/harness /opt/harness/Harness.java && rm /opt/harness/Harness.java

COPY handler.mjs ${LAMBDA_TASK_ROOT}/
ENV RUNNER_LANGUAGE=java
# Removes the role's credentials before the runtime starts (see entrypoint.sh).
COPY entrypoint.sh /opt/pracstack/entrypoint.sh
RUN chmod 0555 /opt/pracstack/entrypoint.sh
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
CMD ["handler.handler"]
