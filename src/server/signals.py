

def deleteContentCb(sender, instance):
    sender.objects.filter(
        references__delete_recursive=True,
        references__target=instance
    ).delete()


def deleteContentValueCb(sender, instance):
    if instance.file:
        instance.file.delete(False)
