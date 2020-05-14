from django.contrib.auth.models import AbstractUser
from .abstract_models import QuotaUserBase

# Create your models here.


class QuotaUser(QuotaUserBase, AbstractUser):
    """ A reference quota user """

    class Meta(AbstractUser.Meta):
        swappable = 'AUTH_USER_MODEL'
