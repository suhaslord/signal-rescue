import math
import unittest
from api.tiles import request_area, cell_bounds

class MapQueries(unittest.TestCase):
    def test_valid_native_view(self):
        self.assertEqual(request_area({'level':['16'],'bbox':['79.95,13.85,80.1,14']}),('2026 Q1',16,[79.95,13.85,80.1,14]))
    def test_rejects_unbounded_or_malformed_requests(self):
        for change in [{'level':['17']},{'bbox':['0,0,10,10']},{'bbox':['nan,0,10,20']},{'bbox':['-180,-80,180,80']},{'bbox':['10,10,0,20']},{'period':["2026 Q1';DROP TABLE t"]}]:
            query={'level':['16'],'bbox':['0,0,1,1']};query.update(change)
            with self.assertRaises(ValueError):request_area(query)
    def test_quadkey_bounds_match_projection(self):
        self.assertEqual(cell_bounds(''),[-180,-85.0511287798066,180,85.0511287798066])
        for key in ['0','123','0230102030012330']:
            w,s,e,n=cell_bounds(key)
            self.assertLess(w,e);self.assertLess(s,n)
            self.assertAlmostEqual(e-w,360/2**len(key))

if __name__=='__main__':unittest.main()
