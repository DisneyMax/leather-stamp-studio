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
  function offsetArtwork(originalPaths, offsetMm) {
    if (Math.abs(offsetMm) < 0.000001) return { artworkPaths: originalPaths, fewerHoles: 0, fewerRegions: 0 };
    const { ClipperOffset, ClipType, JoinType, EndType } = clipperLibrary;
    const canonical = rings(region(ClipType.ctUnion, originalPaths));
    const offset = new ClipperOffset(2, 0.015 * CS);
    const result = [];
    offset.AddPaths(canonical.map(({ path }) => path), JoinType.jtRound, EndType.etClosedPolygon);
    offset.Execute(result, offsetMm * CS);
    if (!result.length) throw Error('Design thickness adjustment removed all artwork. Reduce the negative offset.');
    const output = rings(region(ClipType.ctUnion, cleanOffsetRings(result)));
    if (!output.length) throw Error('Design offset produced no usable filled artwork.');
    const originalHoles = canonical.filter(({ hole }) => hole).length;
    const outputHoles = output.filter(({ hole }) => hole).length;
    return {
      artworkPaths: output.map(({ path }) => path),
      fewerHoles: Math.max(0, originalHoles - outputHoles),
      fewerRegions: Math.max(0, canonical.length - originalHoles - (output.length - outputHoles)),
    };
  }

  function estimateSmallFeatures(artwork, minimumMm) {
    const { ClipperOffset, ClipType, JoinType, EndType } = clipperLibrary;
    const radius = minimumMm * CS / 2;

    function resize(loops, distance) {
      if (!loops.length) return [];
      const offset = new ClipperOffset(2);
      const result = [];
      // Mitered corners avoid flagging the normal corners of a wide rectangle.
      offset.AddPaths(loops, JoinType.jtMiter, EndType.etClosedPolygon);
      offset.Execute(result, distance);
      return result.length ? paths(region(ClipType.ctUnion, result)) : [];
    }

    // Shrink and regrow to find thin filled regions. Grow and shrink to
    // find small openings. The differences are geometric estimates.
    const opened = resize(resize(artwork, -radius), radius);
    const closed = resize(resize(artwork, radius), -radius);
    return {
      narrow: opened.length ? paths(region(ClipType.ctDifference, artwork, opened)) : artwork,
      gaps: closed.length ? paths(region(ClipType.ctDifference, closed, artwork)) : [],
    };
  }

  return { CS, xyPath, cleanLoop, region, rings, paths, cleanOffsetRings, offsetArtwork, estimateSmallFeatures };
});
