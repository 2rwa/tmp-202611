"""Offline structural tests; the real test is run by the Actions inference job."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "aozora_benchmark", ROOT / "scripts/plamo-aozora-benchmark.py")
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)


class BenchTests(unittest.TestCase):
    def test_main_text_without_furigana_or_metadata(self):
        parser = bench.AozoraMainText()
        parser.feed("""<h1>Title</h1><div class="main_text">
        <p>　二人の<ruby><rb>若い</rb><rp>（</rp><rt>わかい</rt><rp>）</rp></ruby>紳士が歩いていました。</p>
        <p>次の文章は、翻訳用に使うための段落となります。</p>
        </div><p>底本: outside work</p>""")
        text = " ".join(parser.paragraphs())
        self.assertIn("若い紳士", text)
        self.assertNotIn("わかい", text)
        self.assertNotIn("底本", text)
        self.assertNotIn("Title", text)

    def test_excerpt_keeps_whole_paragraphs(self):
        p = ["これは長さのある段落です。" * 5] * 100
        text = bench.select_excerpt(p, 300, 0.2)
        self.assertGreaterEqual(len(text), 300)
        self.assertEqual(text.count("\n"), 4)

    def test_model_and_cases(self):
        self.assertEqual(len(bench.CASES), 4)
        self.assertTrue(all(c[2] <= c[4] for c in bench.CASES))
        self.assertIn("Q4_K_M", bench.MODEL)
        self.assertEqual(bench.STOP, ["<|plamo:tag|>", "<|plamo:bos|>"])

    def test_result_completeness(self):
        class MockResponse:
            pass
        self.assertIn("finish_reason", bench.translate.__code__.co_consts)


if __name__ == "__main__":
    unittest.main()
