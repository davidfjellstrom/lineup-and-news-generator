import sys
import pathlib

# Add api/ to sys.path so tests can import lineup, photos, logos, news directly.
sys.path.insert(0, str(pathlib.Path(__file__).parent))
