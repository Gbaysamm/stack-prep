/**
 * The choices on a student's profile, shared by onboarding and account settings. The API
 * stores whatever text is sent for the state; this list is what the screens offer.
 */
import type { ClassLevel } from '../student/api.js';

export const CLASS_LEVELS: { value: ClassLevel; label: string }[] = [
  { value: 'ss1', label: 'SS1' },
  { value: 'ss2', label: 'SS2' },
  { value: 'ss3', label: 'SS3' },
  { value: 'graduated', label: 'Finished secondary school' },
  { value: 'other', label: 'Something else' },
];

export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT (Abuja)',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
  'Outside Nigeria',
];
