"""Asks the supplier for a restocking quote.

The supplier gateway is not reachable from this environment, so every call
fails the way a real outage would: with an internal error whose details must
stay on the server.
"""


def quote_unit_price(sku):
    raise ConnectionRefusedError(
        f"[Errno 111] Connection refused (supplier-gateway.internal:8443) while requesting /v2/quotes/{sku}"
    )
