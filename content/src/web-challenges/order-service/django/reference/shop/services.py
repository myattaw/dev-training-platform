"""Business rules for orders."""
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F

from .models import Order, OrderLine, Product

DISCOUNT_THRESHOLD = Decimal("200.00")
DISCOUNT_RATE = Decimal("0.10")
CENT = Decimal("0.01")


class InsufficientStock(Exception):
    """Not enough stock for a product (the first one in line order)."""

    def __init__(self, product_id):
        super().__init__(f"Not enough stock for product {product_id}.")
        self.product_id = product_id


def place_order(customer_id, lines):
    """Places an order for validated input and returns the stored Order.

    `lines` is a list of {"productId": int, "quantity": int}.
    """
    with transaction.atomic():
        # Check the whole order first: quantities of the same product add up.
        needed = {}
        for line in lines:
            needed[line["productId"]] = needed.get(line["productId"], 0) + line["quantity"]
        products = Product.objects.select_for_update().in_bulk(list(needed))
        for line in lines:
            if products[line["productId"]].stock < needed[line["productId"]]:
                raise InsufficientStock(line["productId"])

        order_lines = []
        subtotal = Decimal("0.00")
        for line in lines:
            product = products[line["productId"]]
            line_total = product.unit_price * line["quantity"]
            order_lines.append(
                OrderLine(
                    product=product,
                    product_name=product.name,
                    quantity=line["quantity"],
                    unit_price=product.unit_price,
                    line_total=line_total,
                )
            )
            subtotal += line_total
        if subtotal >= DISCOUNT_THRESHOLD:
            discount = (subtotal * DISCOUNT_RATE).quantize(CENT, rounding=ROUND_HALF_UP)
        else:
            discount = Decimal("0.00")
        total = subtotal - discount

        # Only now change anything: every check has passed.
        for product_id, quantity in needed.items():
            Product.objects.filter(pk=product_id).update(stock=F("stock") - quantity)
        order = Order.objects.create(
            customer_id=customer_id, subtotal=subtotal, discount=discount, total=total
        )
        for order_line in order_lines:
            order_line.order = order
        OrderLine.objects.bulk_create(order_lines)
    return order
