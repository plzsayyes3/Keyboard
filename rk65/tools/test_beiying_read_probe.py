import unittest

from rk65.tools.beiying_read_probe import matrix_header, request


class MatrixLayerTests(unittest.TestCase):
    def test_matrix_request_selects_base_layer(self):
        self.assertEqual(request("key-matrix", layer=0)[:7], bytes([0x83, 0, 0, 1, 0, 0xF8, 1]))

    def test_matrix_request_selects_fn_layer(self):
        self.assertEqual(request("key-matrix", layer=1)[:7], bytes([0x83, 1, 0, 1, 0, 0xF8, 1]))

    def test_matrix_header_tracks_layer(self):
        self.assertEqual(matrix_header(0), bytes([6, 0x83, 0, 0, 1, 0, 0xF8, 1]))
        self.assertEqual(matrix_header(1), bytes([6, 0x83, 1, 0, 1, 0, 0xF8, 1]))

    def test_invalid_layer_is_rejected(self):
        for layer in (-1, 2):
            with self.subTest(layer=layer), self.assertRaises(ValueError):
                request("key-matrix", layer=layer)


if __name__ == "__main__":
    unittest.main()
