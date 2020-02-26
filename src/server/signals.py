

def deleteContentCb(sender, instance):
    instance.referenced_by.delete()


def deleteContentValueCb(sender, instance):
    if instance.file:
        instance.file.delete(False)
