/* The plan, scale bar, and sample takeoffs share this drawing coordinate system. */
(() => {
  'use strict';

  const width = 1000;
  const height = 766;
  const pixelsPerFoot = 15;
  const rooms = {
    living: { x: 171, y: 405, width: 20 * pixelsPerFoot, height: 15 * pixelsPerFoot },
    kitchen: { x: 171, y: 187, width: 14 * pixelsPerFoot, height: 12 * pixelsPerFoot },
    bedroom: { x: 595, y: 187, width: 15 * pixelsPerFoot, height: 13 * pixelsPerFoot },
    patio: { x: 490, y: 25, width: 22 * pixelsPerFoot, height: 10 * pixelsPerFoot }
  };

  const rect = (x, y, w, h, className = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${className}"/>`;
  const line = (x1, y1, x2, y2, className = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}"/>`;
  const path = (d, className = '') => `<path d="${d}" class="${className}"/>`;
  const text = (value, x, y, className = '') =>
    `<text x="${x}" y="${y}" class="${className}">${value}</text>`;

  function roomLabel(name, x, y, dimensions) {
    return `<g class="room">${text(name, x, y)}${dimensions ? text(dimensions, x, y + 17, 'dimension') : ''}</g>`;
  }

  function horizontalDimension(x1, x2, fromY, y, label) {
    return `<g class="dimension-line">
      ${line(x1, fromY, x1, y + 7)}${line(x2, fromY, x2, y + 7)}
      ${line(x1 - 6, y, x2 + 6, y)}
      ${line(x1 - 4, y + 4, x1 + 4, y - 4, 'tick')}${line(x2 - 4, y + 4, x2 + 4, y - 4, 'tick')}
      ${text(label, (x1 + x2) / 2, y - 5, 'dimension')}
    </g>`;
  }

  function verticalDimension(y1, y2, fromX, x, label) {
    const center = (y1 + y2) / 2;
    return `<g class="dimension-line">
      ${line(fromX, y1, x - 7, y1)}${line(fromX, y2, x - 7, y2)}
      ${line(x, y1 - 5, x, y2 + 5)}
      ${line(x - 4, y1 + 4, x + 4, y1 - 4, 'tick')}${line(x - 4, y2 + 4, x + 4, y2 - 4, 'tick')}
      <text x="${x - 5}" y="${center}" class="dimension" transform="rotate(-90 ${x - 5} ${center})">${label}</text>
    </g>`;
  }

  function horizontalWindow(x, y, w) {
    return `<g class="joinery">${rect(x, y, w, 12)}
      ${line(x, y + 4, x + w, y + 4)}${line(x, y + 8, x + w, y + 8)}
      ${line(x + w / 2, y, x + w / 2, y + 12)}
    </g>`;
  }

  function verticalWindow(x, y, h) {
    return `<g transform="translate(${x + 12} ${y}) rotate(90)">${horizontalWindow(0, 0, h)}</g>`;
  }

  function swingingDoor(x, y, span, rotation = 0, reverse = false) {
    const flip = reverse ? ' scale(1 -1)' : '';
    return `<g class="joinery" transform="translate(${x} ${y}) rotate(${rotation})${flip}">
      ${path(`M 0 0 V ${span} H 1.5 V 0 Z`, 'leaf')}
      ${path(`M ${span} 0 A ${span} ${span} 0 0 1 0 ${span}`, 'swing')}
    </g>`;
  }

  const walls = [
    // Exterior wall strips stop at each frame.
    [159, 175, 71, 12], [319, 175, 174, 12], [553, 175, 97, 12], [751, 175, 81, 12],
    [159, 187, 12, 37], [159, 304, 12, 141], [159, 540, 12, 90],
    [820, 187, 12, 65], [820, 337, 12, 77], [820, 457, 12, 68], [820, 591, 12, 39],
    [159, 630, 91, 12], [392, 630, 92, 12], [536, 630, 129, 12], [758, 630, 74, 12],
    // Interior partitions, door openings and cased opening.
    [381, 187, 12, 93], [381, 337, 12, 42], [171, 367, 210, 12],
    [171, 393, 229, 12], [455, 393, 28, 12],
    [471, 405, 12, 26], [471, 476, 12, 154],
    [583, 187, 12, 128], [583, 365, 12, 49], [595, 382, 225, 12],
    [583, 459, 12, 81], [595, 471, 225, 12], [583, 587, 12, 43]
  ];
  const windows = [
    horizontalWindow(230, 175, 89), horizontalWindow(650, 175, 101),
    verticalWindow(159, 224, 80), verticalWindow(159, 445, 95),
    verticalWindow(820, 252, 85), verticalWindow(820, 414, 43), verticalWindow(820, 525, 66),
    horizontalWindow(250, 630, 142), horizontalWindow(665, 630, 93)
  ];
  const doors = [
    swingingDoor(484, 630, 52, 0, true), swingingDoor(471, 431, 45, 90),
    swingingDoor(595, 365, 50, -90), swingingDoor(595, 459, 45, -90),
    swingingDoor(595, 587, 47, -90)
  ];
  const slidingDoor = `<g class="joinery">
    ${rect(493, 175, 60, 12)}${rect(496, 178, 31, 3)}${rect(519, 181, 31, 3)}
    ${path('M 502 181.5 h 15 m -15 0 l 4 -2 m -4 2 l 4 2', 'swing')}
  </g>`;

  const kitchen = `<g class="furniture">
    ${path('M171 196 H342 V231 H210 V308 H171 Z', 'fixture')}
    ${path('M180 198 H340 M180 229 V305')}
    ${rect(175, 248, 30, 42, 'fixture')}${rect(179, 251, 21, 16)}${rect(179, 271, 21, 16)}
    <circle cx="202" cy="269" r="1.5"/>
    ${rect(242, 200, 47, 29, 'fixture')}
    <circle cx="253" cy="208" r="5"/><circle cx="275" cy="208" r="5"/>
    <circle cx="253" cy="221" r="5"/><circle cx="275" cy="221" r="5"/>
    ${path('M 212 225 V 231 M 297 200 V 231 M 312 200 V 231 M 172 239 H 209 M 172 299 H 205')}
    ${rect(205, 327, 40, 37, 'fixture')}${line(240, 327, 240, 364)}${line(205, 345, 240, 345)}
    ${rect(253, 309, 92, 37, 'fixture')}${line(253, 338, 345, 338)}
  </g>`;
  const dining = `<g class="furniture">
    ${rect(443, 249, 88, 51, 'fixture')}
    ${[454, 497].map(x => rect(x, 230, 22, 16, 'fixture') + rect(x, 303, 22, 16, 'fixture')).join('')}
    ${rect(422, 263, 17, 22, 'fixture')}${rect(535, 263, 17, 22, 'fixture')}
    ${rect(418, 193, 58, 18, 'fixture')}${line(447, 193, 447, 211)}
  </g>`;
  const living = `<g class="furniture">
    ${rect(192, 441, 57, 126, 'fixture')}
    ${rect(197, 448, 10, 112)}${rect(208, 449, 35, 34)}
    ${rect(208, 486, 35, 34)}${rect(208, 523, 35, 34)}
    ${rect(267, 451, 127, 98, 'rug')}${rect(271, 455, 119, 90, 'rug')}
    ${rect(286, 469, 65, 39, 'fixture')}${rect(290, 473, 57, 31)}
    ${rect(418, 494, 49, 97, 'fixture')}${rect(456, 505, 4, 75)}
    ${rect(268, 566, 55, 45, 'fixture')}${rect(274, 571, 43, 31)}
  </g>`;
  const bedroom = `<g class="furniture">
    ${rect(673, 195, 99, 114, 'fixture')}${rect(672, 190, 101, 8, 'fixture')}
    ${rect(679, 200, 40, 23)}${rect(726, 200, 40, 23)}
    ${path('M 673 233 H 772 M 673 242 H 772 L 761 253 H 673')}
    ${rect(637, 198, 28, 30, 'fixture')}${line(637, 221, 665, 221)}
    ${rect(780, 198, 29, 30, 'fixture')}${line(780, 221, 809, 221)}
    ${rect(778, 322, 37, 55, 'fixture')}${path('M 784 325 V 374 M 778 349 H 815')}
    ${rect(606, 192, 26, 79, 'fixture')}${path('M 609 194 V 268 M 606 230 H 632')}
  </g>`;
  const utility = `<g class="furniture">
    ${rect(603, 399, 65, 30, 'fixture')}${rect(618, 404, 32, 18)}
    <circle cx="634" cy="411" r="1.4"/>
    ${rect(748, 395, 67, 72, 'fixture')}${rect(754, 400, 54, 61)}
    ${path('M 754 400 L 775 423 M 808 461 L 785 437 M 754 461 L 775 437 M 808 400 L 785 423', 'rug')}
    <circle cx="780" cy="429" r="5"/>
    ${rect(705, 396, 29, 12, 'fixture')}<ellipse cx="719" cy="419" rx="11" ry="15" class="fixture"/>
    ${rect(751, 491, 62, 38, 'fixture')}${rect(770, 532, 22, 17, 'fixture')}
    ${rect(599, 595, 61, 30, 'fixture')}${line(629, 595, 629, 625)}
  </g>`;
  const patio = `<g class="furniture">
    ${rect(744, 56, 55, 84, 'fixture')}
    ${[63, 109].map(y => rect(724, y, 16, 23, 'fixture') + rect(803, y, 14, 23, 'fixture')).join('')}
    ${rect(760, 37, 23, 15, 'fixture')}${rect(760, 144, 23, 15, 'fixture')}
  </g>`;

  const scaleStart = 48;
  const scaleEnd = scaleStart + 20 * pixelsPerFoot;
  const scaleBar = `<g class="scale">
    ${text(`SCALE BAR: 20'-0&quot;`, scaleStart, 714, 'sheet-meta')}
    ${rect(scaleStart, 723, scaleEnd - scaleStart, 7, 'scale-frame')}
    ${[0, 2].map(index => rect(scaleStart + index * 5 * pixelsPerFoot, 723, 5 * pixelsPerFoot, 7, 'scale-block')).join('')}
    ${[0, 5, 10, 20].map(feet => text(feet + '′', scaleStart + feet * pixelsPerFoot, 745, 'scale-number')).join('')}
  </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <pattern id="decking" width="18" height="16" patternUnits="userSpaceOnUse">
        <path d="M0 0H18" fill="none" stroke="#cfcac0" stroke-width="1"/>
      </pattern>
    </defs>
    <style>
      text { fill: #36383a; font-family: 'IBM Plex Sans', Arial, sans-serif; }
      .sheet-frame { stroke: #ddd8ce; fill: none; }
      .wall { fill: #8b8881; stroke: #66645d; stroke-width: 1; }
      .joinery { fill: #fff; stroke: #6e6d66; stroke-width: 1; }
      .swing { stroke-width: .9; fill: none; }
      .furniture { fill: none; stroke: #a39f96; stroke-width: 1; }
      .fixture { fill: #f8f7f3; }
      .rug { stroke: #c1bcb1; stroke-dasharray: 3 2; fill: none; }
      .room { text-anchor: middle; font-size: 16px; font-weight: 600; }
      .dimension, .scale-number { font: 11px 'IBM Plex Mono', Menlo, monospace; text-anchor: middle; }
      .dimension-line { fill: none; stroke: #a39d91; stroke-width: .8; }
      .dimension-line text { stroke: none; }
      .tick { stroke: #706d64; stroke-width: 1.3; }
      .sheet-title { font-size: 20px; letter-spacing: -.25px; font-weight: 600; }
      .sheet-meta { font: 11px 'IBM Plex Mono', Menlo, monospace; letter-spacing: .8px; }
      .scale-frame { fill: #fff; stroke: #534f48; }
      .scale-block { fill: #534f48; }
      .north { fill: none; stroke: #6e6a60; stroke-width: 1.1; }
      .porch { fill: none; stroke: #aaa598; stroke-width: 1; }
    </style>
    <rect width="${width}" height="${height}" fill="#fff"/>
    ${rect(22, 12, 956, 745, 'sheet-frame')}
    ${line(22, 690, 978, 690, 'sheet-frame')}
    ${line(663, 690, 663, 757, 'sheet-frame')}
    ${line(903, 690, 903, 757, 'sheet-frame')}
    ${text('SAMPLE RESIDENCE', 48, 62, 'sheet-meta')}
    ${text('Ground floor plan', 48, 87, 'sheet-title')}
    ${text('A-01', 927, 729, 'sheet-title')}
    ${text('FLOOR PLAN', 687, 718, 'sheet-meta')}
    ${text('PlanQuote sample drawing', 687, 741)}
    ${scaleBar}
    <rect x="${rooms.patio.x}" y="${rooms.patio.y}" width="${rooms.patio.width}" height="${rooms.patio.height}" fill="url(#decking)" stroke="#9d998e"/>
    ${path('M 476 642 V 675 H 544 V 642 M 476 659 H 544 M 476 667 H 544', 'porch')}
    ${walls.map(([x, y, w, h]) => rect(x, y, w, h, 'wall')).join('')}
    ${windows.join('')}${slidingDoor}${doors.join('')}
    ${kitchen}${dining}${living}${bedroom}${utility}${patio}
    ${roomLabel('Living Room', 327, 430, "20′ × 15′")}
    ${roomLabel('Kitchen', 282, 270, "14′ × 12′")}
    ${roomLabel('Primary Bedroom', 708, 332, "15′ × 13′")}
    ${roomLabel('Rear Patio', 601, 67, "22′ × 10′")}
    ${roomLabel('Dining', 485, 344)}
    ${roomLabel('Bath', 675, 451)}
    ${roomLabel('Study', 706, 567)}
    ${roomLabel('Entry', 527, 566)}
    ${horizontalDimension(171, 471, 646, 665, "20′-0″")}
    ${horizontalDimension(595, 820, 646, 665, "15′-0″")}
    ${verticalDimension(187, 367, 151, 126, "12′-0″")}
    ${verticalDimension(405, 630, 151, 126, "15′-0″")}
    ${verticalDimension(25, 175, 833, 862, "10′-0″")}
    ${verticalDimension(187, 382, 844, 868, "13′-0″")}
    <g>
      ${text('N', 927, 122, 'sheet-meta')}
      ${path('M 930 132 L 920 160 L 930 154 L 940 160 Z M 930 132 V 154', 'north')}
    </g>
  </svg>`;

  function corners(room) {
    const { x, y, width: w, height: h } = room;
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }

  window.PlanQuoteSample = {
    width,
    height,
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    feetPerPixel: 1 / pixelsPerFoot,
    referenceFeet: (scaleEnd - scaleStart) / pixelsPerFoot,
    items: [
      { name: 'Living Room Flooring', preset: 0, kind: 'area', points: corners(rooms.living) },
      { name: 'Rear Patio Decking', preset: 2, kind: 'area', points: corners(rooms.patio) },
      { name: 'Baseboard', preset: 0, kind: 'line', points: [[171, 405], [171, 630], [471, 630], [471, 476]] }
    ]
  };
})();
