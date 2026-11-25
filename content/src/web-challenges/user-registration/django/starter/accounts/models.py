from django.db import models


class UserAccount(models.Model):
    """A registered account. Emails are stored in lower case.

    Only a salted hash of the password is kept (see passwords.py), and this
    model is never returned as is: RegistrationSerializer picks the public fields.
    """

    email = models.CharField(max_length=254, unique=True)
    display_name = models.CharField(max_length=40)
    password_hash = models.CharField(max_length=200)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.display_name} <{self.email}>"
