import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("LOTO_DB", os.path.join(tempfile.mkdtemp(), "test.db"))
