import os, pytest
from app import db
from app.importer import import_workbook, verify

XLSX = os.environ.get("TALLY_XLSX", "")


@pytest.mark.skipif(not os.path.exists(XLSX), reason="set TALLY_XLSX to the workbook path")
def test_import_matches_workbook_to_the_cent():
    con = db.connect(":memory:")
    info = import_workbook(con, XLSX)
    assert info["transactions"] > 0
    result = verify(con, XLSX)
    assert result[0].startswith("checked"), "\n".join(result)
