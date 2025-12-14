// Official FIFA Football Field Dimensions (in meters)
// Reference: FIFA Laws of the Game 2023/24

export const FIFA_FIELD = {
  // Field dimensions (standard international match)
  length: 105,              // 100-110m allowed, 105m standard
  width: 68,                // 64-75m allowed, 68m standard
  
  // Penalty area (large box)
  penaltyAreaDepth: 16.5,   // from goal line
  penaltyAreaWidth: 40.32,  // 16.5m each side of goal + 7.32m goal = 40.32m
  
  // Goal area (small box)
  goalAreaDepth: 5.5,       // from goal line
  goalAreaWidth: 18.32,     // 5.5m each side of goal + 7.32m goal = 18.32m
  
  // Center circle
  centerCircleRadius: 9.15, // 10 yards = 9.15m
  centerSpotDiameter: 0.22, // ~22cm
  
  // Penalty
  penaltySpotDistance: 11,  // from goal line center
  penaltyArcRadius: 9.15,   // same as center circle
  penaltySpotDiameter: 0.22,
  
  // Corner
  cornerArcRadius: 1,       // 1 meter
  cornerFlagHeight: 1.5,    // minimum 1.5m
  
  // Goal
  goalWidth: 7.32,          // 8 yards = 7.32m
  goalHeight: 2.44,         // 8 feet = 2.44m
  goalDepth: 2,             // net depth ~2m
  postDiameter: 0.12,       // 12cm maximum
  crossbarDiameter: 0.12,
  
  // Lines
  lineWidth: 0.12,          // 12cm maximum
  
  // Technical area (optional)
  technicalAreaWidth: 1,    // 1m each side of dugout
  technicalAreaDepth: 1,    // 1m from touchline
} as const;

// Derived calculations
export const FIELD_CALCULATIONS = {
  // Half field
  halfLength: FIFA_FIELD.length / 2,
  halfWidth: FIFA_FIELD.width / 2,
  
  // Goal position (centered on goal line)
  goalPostLeft: (FIFA_FIELD.width - FIFA_FIELD.goalWidth) / 2,
  goalPostRight: (FIFA_FIELD.width + FIFA_FIELD.goalWidth) / 2,
  
  // Penalty area corners
  penaltyAreaLeft: (FIFA_FIELD.width - FIFA_FIELD.penaltyAreaWidth) / 2,
  penaltyAreaRight: (FIFA_FIELD.width + FIFA_FIELD.penaltyAreaWidth) / 2,
  
  // Goal area corners
  goalAreaLeft: (FIFA_FIELD.width - FIFA_FIELD.goalAreaWidth) / 2,
  goalAreaRight: (FIFA_FIELD.width + FIFA_FIELD.goalAreaWidth) / 2,
  
  // Penalty arc calculation (arc outside penalty area)
  penaltyArcStartAngle: Math.acos(FIFA_FIELD.penaltyAreaDepth / FIFA_FIELD.penaltyArcRadius),
} as const;

// Scale factors for different rendering contexts
export const SCALE_FACTORS = {
  svg2D: 10,        // 1 meter = 10 units in SVG (viewBox 1050 x 680)
  threejs3D: 1,     // 1 meter = 1 unit in Three.js
  normalized: 100,  // 0-100 scale for percentage-based positioning
} as const;

// Utility functions for coordinate conversion
export function metersToSvg(meters: number): number {
  return meters * SCALE_FACTORS.svg2D;
}

export function svgToMeters(svgUnits: number): number {
  return svgUnits / SCALE_FACTORS.svg2D;
}

export function normalizedToMeters(normalized: number, dimension: 'x' | 'y'): number {
  const maxDimension = dimension === 'x' ? FIFA_FIELD.length : FIFA_FIELD.width;
  return (normalized / 100) * maxDimension;
}

export function metersToNormalized(meters: number, dimension: 'x' | 'y'): number {
  const maxDimension = dimension === 'x' ? FIFA_FIELD.length : FIFA_FIELD.width;
  return (meters / maxDimension) * 100;
}

// Field zones for tactical analysis
export const FIELD_ZONES = {
  defensiveThird: { start: 0, end: 35 },
  middleThird: { start: 35, end: 70 },
  attackingThird: { start: 70, end: 105 },
  
  leftFlank: { start: 0, end: 22.67 },
  center: { start: 22.67, end: 45.33 },
  rightFlank: { start: 45.33, end: 68 },
} as const;

export type FieldZone = keyof typeof FIELD_ZONES;
