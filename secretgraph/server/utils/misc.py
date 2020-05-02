

class FakeList(list):
    def __init__(self, l):
        self.inner = l
        super().__init__()

    def __iter__(self):
        return iter(self.inner)

    def __bool__(self):
        return bool(self.inner)


class FakeStr(str):
    def __init__(self, l):
        self.inner = l
        super().__init__()

    def __iter__(self):
        return iter(self.inner)

    def __bool__(self):
        return bool(self.inner)
