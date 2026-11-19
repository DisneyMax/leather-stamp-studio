// The browser loads this as a classic script so index.html also works from disk.
(function exposePolygonGeometry(createPolygonGeometry) {
  if (typeof module === 'object' && module.exports) {
    module.exports = createPolygonGeometry;
  } else {
    globalThis.createPolygonGeometry = createPolygonGeometry;
  }
})(function createPolygonGeometry(clipperLibrary) {
  const CS = 10000;

  function xyPath(points) {
    return points.map(({ x, y }) => ({ X: Math.round(x * CS), Y: Math.round(y * CS) }));
  }

  function cleanLoop(path) {
    const points = [];
    const samePoint = (a, b) => a.X === b.X && a.Y === b.Y;
    for (const point of path) {
      if (!points.length || !samePoint(point, points.at(-1))) points.push(point);
    }
    if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
    return points;
  }

  function region(operation, subject, clip = []) {
    const { Clipper, PolyTree, PolyType, PolyFillType } = clipperLibrary;
    const clipper = new Clipper();
    clipper.StrictlySimple = true;
    if (subject.length) clipper.AddPaths(subject, PolyType.ptSubject, true);
    if (clip.length) clipper.AddPaths(clip, PolyType.ptClip, true);
    const tree = new PolyTree();
    const fill = PolyFillType.pftNonZero;
    if (!clipper.Execute(operation, tree, fill, fill)) throw Error('2D polygon operation failed');
    return tree;
  }

  function rings(tree) {
    const output = [];
    function visit(node) {
      for (const child of node.Childs()) {
        const contour = child.Contour();
        if (contour.length >= 3) output.push({ path: contour, hole: child.IsHole() });
        visit(child);
      }
    }
    visit(tree);
    return output;
  }

  function paths(tree) {
    return rings(tree).map(({ path }) => path);
  }

  // Offset operations can add slivers only a few coordinate-grid units wide.
  // Clean those before triangulation without using the user-facing SVG tolerance.
  function cleanOffsetRings(loops) {
    return clipperLibrary.Clipper.CleanPolygons(loops, 2);
  }

  // The input is already sized in millimeters. Expanding filled regions
  // contracts their holes, and shrinking filled regions expands their holes.
  function offsetArtworkPaths(originalPaths, offsetMm) {
    if (Math.abs(offsetMm) < 0.000001) return originalPaths;
    const { ClipperOffset, ClipType, JoinType, EndType } = clipperLibrary;
    const canonical = paths(region(ClipType.ctUnion, originalPaths));
    const offset = new ClipperOffset(2, 0.015 * CS);
    const result = [];
    offset.AddPaths(canonical, JoinType.jtRound, EndType.etClosedPolygon);
    offset.Execute(result, offsetMm * CS);
    if (!result.length) throw Error('Design thickness adjustment removed all artwork. Reduce the negative offset.');
    const output = paths(region(ClipType.ctUnion, cleanOffsetRings(result)));
    if (!output.length) throw Error('Design offset produced no usable filled artwork.');
    return output;
  }

  return { CS, xyPath, cleanLoop, region, rings, paths, cleanOffsetRings, offsetArtworkPaths };
});
