/**
 * Body-diagram zone definitions and label lookup. Lives in lib/ (not in the
 * client component) so server components can resolve zone codes to human
 * labels without pulling in a "use client" module.
 *
 * Codes are prefixed:
 *   f-* = front view
 *   b-* = back view
 */

export type Zone = {
  code: string;
  label: string;
  cx: number;
  cy: number;
};

export const FRONT_ZONES: Zone[] = [
  { code: "f-head",        label: "Head / face",                  cx: 60,  cy: 25  },
  { code: "f-neck",        label: "Neck (front)",                 cx: 60,  cy: 40  },
  { code: "f-shoulder-l",  label: "Left shoulder (front)",        cx: 38,  cy: 50  },
  { code: "f-shoulder-r",  label: "Right shoulder (front)",       cx: 82,  cy: 50  },
  { code: "f-chest-l",     label: "Left chest",                   cx: 50,  cy: 65  },
  { code: "f-chest-r",     label: "Right chest",                  cx: 70,  cy: 65  },
  { code: "f-arm-l",       label: "Left upper arm (front)",       cx: 26,  cy: 80  },
  { code: "f-arm-r",       label: "Right upper arm (front)",      cx: 94,  cy: 80  },
  { code: "f-abdomen",     label: "Abdomen",                      cx: 60,  cy: 92  },
  { code: "f-forearm-l",   label: "Left forearm (front)",         cx: 22,  cy: 115 },
  { code: "f-forearm-r",   label: "Right forearm (front)",        cx: 98,  cy: 115 },
  { code: "f-hip-l",       label: "Left hip",                     cx: 53,  cy: 122 },
  { code: "f-hip-r",       label: "Right hip",                    cx: 67,  cy: 122 },
  { code: "f-quad-l",      label: "Left thigh (front)",           cx: 51,  cy: 155 },
  { code: "f-quad-r",      label: "Right thigh (front)",          cx: 69,  cy: 155 },
  { code: "f-knee-l",      label: "Left knee",                    cx: 51,  cy: 178 },
  { code: "f-knee-r",      label: "Right knee",                   cx: 69,  cy: 178 },
  { code: "f-shin-l",      label: "Left shin",                    cx: 51,  cy: 200 },
  { code: "f-shin-r",      label: "Right shin",                   cx: 69,  cy: 200 },
];

export const BACK_ZONES: Zone[] = [
  { code: "b-head",        label: "Back of head",                 cx: 60,  cy: 25  },
  { code: "b-neck",        label: "Neck (back)",                  cx: 60,  cy: 40  },
  { code: "b-trap-l",      label: "Left trapezius",               cx: 50,  cy: 52  },
  { code: "b-trap-r",      label: "Right trapezius",              cx: 70,  cy: 52  },
  { code: "b-shoulder-l",  label: "Left shoulder (back)",         cx: 38,  cy: 60  },
  { code: "b-shoulder-r",  label: "Right shoulder (back)",        cx: 82,  cy: 60  },
  { code: "b-arm-l",       label: "Left upper arm (back)",        cx: 26,  cy: 80  },
  { code: "b-arm-r",       label: "Right upper arm (back)",       cx: 94,  cy: 80  },
  { code: "b-upper-back",  label: "Upper back",                   cx: 60,  cy: 75  },
  { code: "b-mid-back",    label: "Mid back",                     cx: 60,  cy: 95  },
  { code: "b-forearm-l",   label: "Left forearm (back)",          cx: 22,  cy: 115 },
  { code: "b-forearm-r",   label: "Right forearm (back)",         cx: 98,  cy: 115 },
  { code: "b-lower-back",  label: "Lower back / lumbar",          cx: 60,  cy: 118 },
  { code: "b-glute-l",     label: "Left glute",                   cx: 53,  cy: 135 },
  { code: "b-glute-r",     label: "Right glute",                  cx: 67,  cy: 135 },
  { code: "b-hamstring-l", label: "Left hamstring",               cx: 51,  cy: 162 },
  { code: "b-hamstring-r", label: "Right hamstring",              cx: 69,  cy: 162 },
  { code: "b-calf-l",      label: "Left calf",                    cx: 51,  cy: 195 },
  { code: "b-calf-r",      label: "Right calf",                   cx: 69,  cy: 195 },
];

export const ALL_ZONES: Zone[] = [
  ...FRONT_ZONES,
  ...BACK_ZONES.map((z) => ({ ...z, cx: z.cx + 120 })),
];

export function zoneLabel(code: string): string {
  return ALL_ZONES.find((z) => z.code === code)?.label ?? code;
}
