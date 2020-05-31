from django.forms import fields


class OpenChoiceField(fields.ChoiceField):
    validate_choice = None

    def __init__(
        self, *, choices=(), initial=None, validate_choice=None, **kwargs
    ):
        super().__init__(choices=choices, **kwargs)
        self.validate_choice = validate_choice

    def valid_value(self, value):
        if not self.validate_choice:
            return True
        return self.validate_choice(value)


class MultipleOpenChoiceField(fields.MultipleChoiceField):
    validate_choice = None

    def __init__(
        self, *, choices=(), initial=None, validate_choice=None, **kwargs
    ):
        super().__init__(choices=choices, **kwargs)
        self.validate_choice = validate_choice

    def valid_value(self, value):
        if not self.validate_choice:
            return True
        return self.validate_choice(value)
