import pytest
from fastapi import HTTPException

from app.auth.service import normalise_phone


@pytest.mark.parametrize("raw", ["+923001110001", "923001110001", "03001110001", "0300 1110001", "0300-111-0001",
                                 "00923001110001", "3001110001", " +92 300 1110001 "])
def test_every_normal_way_of_typing_a_number(raw):
    assert normalise_phone(raw) == "+923001110001"


@pytest.mark.parametrize("raw", ["", "abc", "12345", "+1555"])
def test_nonsense_still_refused(raw):
    with pytest.raises(HTTPException):
        normalise_phone(raw)
