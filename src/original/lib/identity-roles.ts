// The hero presents a fixed "CURRENTLY" readout. The user specifies these exact
// three lines and their order, so they are constants rather than CMS-derived text.
export const CURRENTLY_EDUCATION = 'UnderGrad @ IIT Madras';
export const CURRENTLY_INTERNSHIP = 'Intern @ IIT Ropar';
export const CURRENTLY_FOUNDER = 'CoFounder @Cynorva';

export const CURRENTLY_LINES: readonly string[] = [
  CURRENTLY_EDUCATION,
  CURRENTLY_INTERNSHIP,
  CURRENTLY_FOUNDER,
];

export function deriveCurrentlyLines(): string[] {
  return [...CURRENTLY_LINES];
}
