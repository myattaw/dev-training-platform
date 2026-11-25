"""Business rules for orders."""
from decimal import Decimal

DISCOUNT_THRESHOLD = Decimal("200.00")
DISCOUNT_RATE = Decimal("0.10")


class InsufficientStock(Exception):
    """Not enough stock for a product (the first one in line order)."""

    def __init__(self, product_id):
        super().__init__(f"Not enough stock for product {product_id}.")
        self.product_id = product_id


def place_order(customer_id, lines):
    """Places an order for validated input and returns the stored Order.

    `lines` is a list of {"productId": int, "quantity": int}.

    TODO:
    1. Check stock for the whole order (quantities of the same product add up)
       and raise InsufficientStock for the first product that is short.
    2. Compute line totals, subtotal, discount (half-up to 2 places) and total.
    3. Reduce stock and store the order and its lines, all or nothing.
    """
    raise NotImplementedError
