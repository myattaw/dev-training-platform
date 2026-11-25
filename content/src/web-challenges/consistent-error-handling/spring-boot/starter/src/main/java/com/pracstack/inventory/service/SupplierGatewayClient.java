package com.pracstack.inventory.service;

import java.math.BigDecimal;
import org.springframework.stereotype.Component;

/**
 * Asks the supplier for a restocking quote. The supplier gateway is not
 * reachable from this environment, so every call fails the way a real outage
 * would: with an internal error whose details must stay on the server.
 */
@Component
public class SupplierGatewayClient {
    public BigDecimal quoteUnitPrice(String sku) {
        throw new IllegalStateException(
                "Connection refused (supplier-gateway.internal:8443) while requesting /v2/quotes/" + sku);
    }
}
