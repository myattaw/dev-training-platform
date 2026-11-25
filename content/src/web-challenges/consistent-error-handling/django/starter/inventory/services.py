"""Inventory rules. Failures are reported by raising NotFoundError,
ConflictError or InvalidInputError (see errors.py)."""
import re

from django.db import IntegrityError, transaction

from . import supplier
from .errors import ConflictError, InvalidInputError, NotFoundError
from .models import Item

SKU = re.compile(r"^[A-Z]{3}-[0-9]{3}$")


def to_json(item):
    return {"sku": item.sku, "name": item.name, "quantity": item.quantity}


def _whole_number(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _body(data):
    return data if isinstance(data, dict) else {}


def all_items():
    return list(Item.objects.order_by("sku"))


def get_item(sku):
    item = Item.objects.filter(sku=sku).first()
    if item is None:
        raise NotFoundError(f"Item {sku} was not found.")
    return item


def create_item(data):
    data = _body(data)
    sku = data.get("sku")
    sku = sku.strip() if isinstance(sku, str) else ""
    name = data.get("name")
    name = name.strip() if isinstance(name, str) else ""
    quantity = data.get("quantity")
    fields = {}
    if not sku:
        fields["sku"] = ["SKU is required."]
    elif not SKU.match(sku):
        fields["sku"] = ["SKU must look like ABC-123."]
    if not 1 <= len(name) <= 80:
        fields["name"] = ["Name is required (1-80 characters)."]
    if not _whole_number(quantity) or not 0 <= quantity <= 10_000:
        fields["quantity"] = ["Quantity must be a whole number from 0 to 10000."]
    if fields:
        raise InvalidInputError(fields)
    if Item.objects.filter(sku=sku).exists():
        raise ConflictError(f"Item {sku} already exists.")
    try:
        with transaction.atomic():
            return Item.objects.create(sku=sku, name=name, quantity=quantity)
    except IntegrityError:
        raise ConflictError(f"Item {sku} already exists.") from None


def reserve(sku, data):
    quantity = _body(data).get("quantity")
    if not _whole_number(quantity) or quantity < 1:
        raise InvalidInputError({"quantity": ["Quantity must be a whole number of at least 1."]})
    with transaction.atomic():
        item = get_item(sku)
        if quantity > item.quantity:
            raise ConflictError(f"Only {item.quantity} units of {sku} are in stock.")
        item.quantity -= quantity
        item.save(update_fields=["quantity"])
        return item


def supplier_quote(sku):
    item = get_item(sku)
    return {"sku": item.sku, "unitPrice": str(supplier.quote_unit_price(item.sku))}
