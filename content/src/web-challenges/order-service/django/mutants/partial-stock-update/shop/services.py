"""Business rules for orders."""
from contextlib import nullcontext
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
    with nullcontext():
        # Check the whole order first: quantities of the same product add up.
        needed = {}
        for line in lines:
            needed[line["productId"]] = needed.get(line["productId"], 0) + line["quantity"]
        products = Product.objects.in_bulk(list(needed))
        for line in lines:
            if Product.objects.get(pk=line["productId"]).stock < line["quantity"]:
                raise InsufficientStock(line["productId"])
            Product.objects.filter(pk=line["productId"]).update(stock=F("stock") - line["quantity"])

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
        order = Order.objects.create(
            customer_id=customer_id, subtotal=subtotal, discount=discount, total=total
        )
        for order_line in order_lines:
            order_line.order = order
        OrderLine.objects.bulk_create(order_lines)
    return order
