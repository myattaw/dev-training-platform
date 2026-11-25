package com.pracstack.quotes.pricing;

import java.util.List;

/** A priced quote. All amounts are in cents. */
public record Quote(List<QuoteLine> lines, long subtotalCents, long discountCents, long totalCents) {}
