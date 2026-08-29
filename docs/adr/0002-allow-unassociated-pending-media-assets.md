# Allow pending Media Assets without Lesson Audio

A `PENDING` Media Asset may exist without a Lesson Audio, giving Media Asset to
Lesson Audio a `1 → 0..1` relationship during upload. Lesson Audio is created
only after object-storage validation marks the Media Asset `READY`, avoiding an
audio rendition that points at an incomplete or failed upload.
