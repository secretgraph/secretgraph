# Generated by Django 5.0.2 on 2024-02-13 23:06

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('secretgraph', '0009_move_nonce'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='content',
            name='nonce',
        ),
    ]
