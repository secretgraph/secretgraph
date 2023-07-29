# Generated by Django 4.2.3 on 2023-07-29 01:30

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("secretgraph", "0003_netgroup_hidden"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="sgroupproperty",
            options={
                "verbose_name": "Group Property",
                "verbose_name_plural": "Group Properties",
            },
        ),
        migrations.AlterField(
            model_name="clustergroup",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="clustergroup",
            name="injectedKeys",
            field=models.ManyToManyField(
                blank=True,
                limit_choices_to={"cluster_id": 0, "type": "PublicKey"},
                related_name="injectedFor",
                to="secretgraph.content",
            ),
        ),
        migrations.AlterField(
            model_name="clustergroup",
            name="properties",
            field=models.ManyToManyField(
                blank=True,
                limit_choices_to=models.Q(
                    ("name__startswith", "manage_"), _negated=True
                ),
                related_name="clusterGroups",
                to="secretgraph.sgroupproperty",
            ),
        ),
        migrations.AlterField(
            model_name="netgroup",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="netgroup",
            name="nets",
            field=models.ManyToManyField(
                blank=True,
                help_text="net groups: groups for user permissions including admin access",
                related_name="groups",
                to="secretgraph.net",
            ),
        ),
    ]
