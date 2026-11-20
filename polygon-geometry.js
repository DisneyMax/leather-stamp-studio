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

  function stampBorder(baseTree, artworkTree, { placement, shape, gap, thickness, sharp }) {
    const { ClipperOffset, ClipType, JoinType, EndType } = clipperLibrary;
    const base = paths(baseTree);
    const artwork = paths(artworkTree);
    const difference = (a, b) => region(ClipType.ctDifference, a, b);
    const intersects = (a, b) => paths(region(ClipType.ctIntersection, a, b)).length > 0;
    function offset(loops, distance, join) {
      if (!distance) return loops;
      const engine = new ClipperOffset(2, 0.001 * CS);
      const result = [];
      engine.AddPaths(loops, join, EndType.etClosedPolygon);
      engine.Execute(result, distance * CS);
      const cleaned = cleanOffsetRings(result).filter(loop => loop.length >= 3);
      return cleaned.length ? paths(region(ClipType.ctUnion, cleaned)) : [];
    }

    let inner, outer;
    if (placement === 'base') {
      inner = offset(base, -gap - thickness, JoinType.jtMiter);
      outer = offset(base, -gap, JoinType.jtMiter);
      if (inner.length !== 1 || outer.length !== 1) throw Error('The border collapses or splits. Reduce the inset or thickness.');
    } else if (shape === 'contour') {
      // Fill internal holes before offsetting so counters receive no rings.
      const silhouettes = artworkTree.Childs().map(node => node.Contour());
      // Allow for the sagitta and rounding of the sampled arcs.
      const clearance = gap ? gap + 0.0012 : 0;
      inner = offset(silhouettes, clearance, JoinType.jtRound);
      outer = offset(silhouettes, clearance + thickness, JoinType.jtRound);
    } else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const loop of artwork) for (const { X, Y } of loop) {
        minX = Math.min(minX, X / CS); minY = Math.min(minY, Y / CS);
        maxX = Math.max(maxX, X / CS); maxY = Math.max(maxY, Y / CS);
      }
      const box = [xyPath([
        { x: minX, y: minY }, { x: maxX, y: minY },
        { x: maxX, y: maxY }, { x: minX, y: maxY },
      ])];
      if (shape === 'rect') {
        inner = offset(box, gap, JoinType.jtMiter);
        outer = offset(box, gap + thickness, JoinType.jtMiter);
      } else if (shape === 'roundrect') {
        // The rounded inner frame encloses the entire clearance buffer of the box.
        const radius = Math.max(0.5, gap) + 0.0012;
        inner = offset(box, radius, JoinType.jtRound);
        outer = offset(box, radius + thickness, JoinType.jtRound);
      } else {
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const rx = (maxX - minX) / 2 + gap, ry = (maxY - minY) / 2 + gap;
        const buffered = offset(artwork, gap, JoinType.jtMiter);
        let scale = 1;
        for (const loop of buffered) for (const { X, Y } of loop) {
          scale = Math.max(scale, Math.hypot((X / CS - cx) / rx, (Y / CS - cy) / ry));
        }
        const segments = 128;
        scale = (scale + 0.0002 / Math.min(rx, ry)) / Math.cos(Math.PI / segments);
        inner = [xyPath(Array.from({ length: segments }, (_, i) => {
          const angle = 2 * Math.PI * i / segments;
          return { x: cx + rx * scale * Math.cos(angle), y: cy + ry * scale * Math.sin(angle) };
        }))];
        outer = offset(inner, thickness, JoinType.jtRound);
      }
    }

    if (!inner.length || !outer.length || paths(difference(inner, outer)).length) {
      throw Error('Could not form a complete border. Reduce the gap or change the shape.');
    }
    const border = difference(outer, inner);
    if (!border.Childs().length || border.Childs().some(node => !node.Childs().some(child => child.IsHole()))) {
      throw Error('The border ring collapses or splits. Reduce the gap or change the shape.');
    }
    const borderPaths = paths(border);
    if (paths(difference(borderPaths, base)).length) {
      throw Error('The border extends beyond the base. Enlarge the base or reduce the gap or thickness.');
    }
    const joined = placement === 'artwork' && gap === 0 && sharp;
    if (placement === 'artwork' && gap === 0 && !sharp) {
      throw Error('A zero artwork gap requires Sharp artwork edges. Increase the gap or select Sharp.');
    }
    if (!joined && intersects(offset(borderPaths, 0.0003, JoinType.jtMiter), artwork)) {
      throw Error('The border touches the artwork. Adjust the border or move or resize the artwork.');
    }
    return border;
  }

  return { CS, xyPath, cleanLoop, region, rings, paths, cleanOffsetRings, offsetArtwork, estimateSmallFeatures, stampBorder };
});
