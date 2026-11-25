"""The business date the service works with.

Fixed so that "overdue" is deterministic: every environment (and every test
run) agrees on today.
"""
from datetime import date

TODAY = date(2026, 3, 15)
