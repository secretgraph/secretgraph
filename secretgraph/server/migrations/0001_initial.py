# Generated by Django 3.2.5 on 2021-07-23 22:32
# flake8: noqa

import re
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.db.models.expressions
import django.utils.timezone
import django.core.validators
import secretgraph.server.models
import secretgraph.server.validators
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Net",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "created",
                    models.DateTimeField(auto_now_add=True),
                ),
                ("active", models.BooleanField(blank=True, default=True)),
                (
                    "quota",
                    models.PositiveIntegerField(
                        blank=True,
                        default=None,
                        help_text="quota in Bytes, null for no limit",
                        null=True,
                    ),
                ),
                (
                    "max_upload_size",
                    models.PositiveIntegerField(
                        blank=True, default=None, null=True
                    ),
                ),
                (
                    "bytes_in_use",
                    models.PositiveBigIntegerField(blank=True, default=0),
                ),
            ],
        ),
        migrations.CreateModel(
            name="Cluster",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "flexid",
                    models.CharField(
                        blank=True, max_length=36, null=True, unique=True
                    ),
                ),
                (
                    "flexid_cached",
                    models.CharField(
                        blank=True, max_length=80, null=True, unique=True
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        blank=True,
                        default="",
                        max_length=181,
                        null=False,
                        validators=[
                            secretgraph.server.validators.SafeNameValidator
                        ],
                    ),
                ),
                (
                    "name_cached",
                    models.CharField(
                        blank=True, max_length=252, null=True, unique=True
                    ),
                ),
                (
                    "globalNameRegisteredAt",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "net",
                    models.ForeignKey(
                        null=False,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="clusters",
                        to="secretgraph.net",
                    ),
                ),
                ("description", models.TextField(blank=True, default="")),
                ("featured", models.BooleanField(blank=True, default=False)),
                ("updated", models.DateTimeField(auto_now=True)),
                (
                    "updateId",
                    models.UUIDField(blank=True, default=uuid.uuid4),
                ),
                (
                    "markForDestruction",
                    models.DateTimeField(blank=True, null=True),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="Content",
            options={
                # "order_with_respect_to": "cluster",
            },
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "flexid",
                    models.CharField(
                        blank=True, max_length=36, null=True, unique=True
                    ),
                ),
                (
                    "flexid_cached",
                    models.CharField(
                        blank=True, max_length=80, null=True, unique=True
                    ),
                ),
                ("updated", models.DateTimeField(auto_now=True)),
                (
                    "updateId",
                    models.UUIDField(blank=True, default=uuid.uuid4),
                ),
                (
                    "markForDestruction",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "state",
                    models.CharField(max_length=10, null=False),
                ),
                (
                    "type",
                    models.CharField(
                        max_length=50,
                        null=False,
                        validators=[
                            secretgraph.server.validators.TypeAndGroupValidator,
                            django.core.validators.MinLengthValidator(1),
                        ],
                    ),
                ),
                ("hidden", models.BooleanField(blank=True, default=False)),
                (
                    "nonce",
                    models.CharField(
                        max_length=255, null=False, blank=True, default=""
                    ),
                ),
                (
                    "file",
                    models.FileField(
                        upload_to=secretgraph.server.models.get_content_file_path
                    ),
                ),
                (
                    "contentHash",
                    models.CharField(
                        blank=True,
                        max_length=255,
                        null=True,
                        validators=[
                            secretgraph.server.validators.ContentHashValidator
                        ],
                    ),
                ),
                (
                    "net",
                    models.ForeignKey(
                        null=False,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="contents",
                        to="secretgraph.net",
                    ),
                ),
                (
                    "cluster",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="contents",
                        to="secretgraph.cluster",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ContentTag",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("tag", models.TextField()),
                (
                    "content",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tags",
                        to="secretgraph.content",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ContentReference",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "group",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="ContentReference group: references are clustered in groups. They are used to signal different functions of the connection",
                        max_length=50,
                        validators=[
                            secretgraph.server.validators.TypeAndGroupValidator
                        ],
                    ),
                ),
                ("extra", models.TextField(blank=True, default="")),
                (
                    "deleteRecursive",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("a", "True"),
                            ("b", "False"),
                            ("c", "No Group"),
                        ],
                        default="a",
                        max_length=1,
                    ),
                ),
                (
                    "source",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="references",
                        to="secretgraph.content",
                    ),
                ),
                (
                    "target",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="referencedBy",
                        to="secretgraph.content",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ContentAction",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "group",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="ContentAction group: ContentActions are clustered in groups. They are used to signal different functions of the connection",
                        max_length=50,
                        validators=[
                            secretgraph.server.validators.TypeAndGroupValidator
                        ],
                    ),
                ),
                (
                    "content",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="actions",
                        to="secretgraph.content",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="Action",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("used", models.BooleanField(blank=True, default=False)),
                (
                    "keyHash",
                    models.CharField(
                        max_length=255,
                        validators=[
                            secretgraph.server.validators.ActionKeyHashValidator
                        ],
                    ),
                ),
                ("nonce", models.CharField(max_length=255)),
                ("value", models.BinaryField()),
                (
                    "start",
                    models.DateTimeField(
                        blank=True, default=django.utils.timezone.now
                    ),
                ),
                ("stop", models.DateTimeField(blank=True, null=True)),
                (
                    "cluster",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="actions",
                        to="secretgraph.cluster",
                    ),
                ),
                (
                    "contentAction",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="action",
                        to="secretgraph.contentaction",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="GlobalGroupProperty",
            fields=[
                (
                    "id",
                    models.AutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        max_length=50,
                        unique=True,
                        validators=[
                            secretgraph.server.validators.SafeNameValidator,
                            django.core.validators.MinLengthValidator(1),
                        ],
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="GlobalGroup",
            fields=[
                (
                    "id",
                    models.AutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        max_length=50,
                        unique=True,
                        validators=[
                            secretgraph.server.validators.SafeNameValidator,
                            django.core.validators.MinLengthValidator(1),
                        ],
                    ),
                ),
                ("description", models.TextField()),
                ("hidden", models.BooleanField(blank=True, default=False)),
                (
                    "matchUserGroup",
                    models.BooleanField(blank=True, default=False),
                ),
                (
                    "injectedKeys",
                    models.ManyToManyField(
                        limit_choices_to={
                            "cluster_id": 0,
                            "type": "PublicKey",
                        },
                        related_name="injectedFor",
                        to="secretgraph.Content",
                    ),
                ),
                (
                    "properties",
                    models.ManyToManyField(
                        related_name="groups",
                        to="secretgraph.GlobalGroupProperty",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="GlobalGroupCluster",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "cluster",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="secretgraph.cluster",
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="secretgraph.globalgroup",
                    ),
                ),
            ],
        ),
        migrations.AddField(
            model_name="globalgroup",
            name="clusters",
            field=models.ManyToManyField(
                help_text="cluster groups: groups for permissions and injected keys",
                related_name="groups",
                through="secretgraph.GlobalGroupCluster",
                to="secretgraph.Cluster",
            ),
        ),
        migrations.AddConstraint(
            model_name="globalgroupcluster",
            constraint=models.UniqueConstraint(
                fields=("cluster", "group"), name="globalgroupcluster_unique"
            ),
        ),
        migrations.AddConstraint(
            model_name="contenttag",
            constraint=models.UniqueConstraint(
                fields=("content", "tag"), name="unique_content_tag"
            ),
        ),
        migrations.AddConstraint(
            model_name="contentreference",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("source", django.db.models.expressions.F("target")),
                    _negated=True,
                ),
                name="contentreference_no_self_ref",
            ),
        ),
        migrations.AddConstraint(
            model_name="contentreference",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(
                        models.Q(
                            ("group", "key"),
                            ("group", "transfer"),
                            _connector="OR",
                        ),
                        _negated=True,
                    ),
                    ("deleteRecursive", "c"),
                    _connector="OR",
                ),
                name="contentreference_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="contentreference",
            constraint=models.UniqueConstraint(
                fields=("source", "target", "group"),
                name="contentreference_unique",
            ),
        ),
        migrations.AddConstraint(
            model_name="contentaction",
            constraint=models.UniqueConstraint(
                fields=("content", "group"), name="contentaction_unique"
            ),
        ),
        migrations.AddConstraint(
            model_name="content",
            constraint=models.UniqueConstraint(
                fields=("contentHash", "cluster_id"), name="unique_content"
            ),
        ),
        migrations.AddConstraint(
            model_name="action",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("start__lte", django.db.models.expressions.F("stop")),
                    ("stop__isnull", True),
                    _connector="OR",
                ),
                name="action_order",
            ),
        ),
        migrations.AddConstraint(
            model_name="action",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("start__isnull", False),
                    ("stop__isnull", False),
                    _connector="OR",
                ),
                name="action_exist",
            ),
        ),
    ]
