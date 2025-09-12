from services.model.encoders import MultiModalEncoders
e = MultiModalEncoders()
v = e.encode("اختبار")
print("Encoder vector length:", len(v))
assert len(v) == 384