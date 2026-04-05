// Services data derived from Services.txt
// gender: 'male' | 'female' | 'both'
export const SERVICES = [
  // ── Male Services ──────────────────────────────────────────────
  { id: 'm1',  name: 'Haircut',                      gender: 'male',   duration: 35 },
  { id: 'm2',  name: 'Kids Haircut',                  gender: 'male',   duration: 30 },
  { id: 'm3',  name: 'Head Shave',                    gender: 'male',   duration: 30 },
  { id: 'm4',  name: 'Beard Trim & Styling',          gender: 'male',   duration: 25 },
  { id: 'm5',  name: 'Traditional Hot Towel Shave',   gender: 'male',   duration: 30 },
  { id: 'm6',  name: 'Moustache Trim',                gender: 'male',   duration: 15 },
  { id: 'm7',  name: 'Hair & Beard Color (Touch-Up)', gender: 'male',   duration: 30 },
  { id: 'm8',  name: 'Global Hair Color',             gender: 'male',   duration: 60 },
  { id: 'm9',  name: 'Hair Spa & Scalp Treatment',    gender: 'male',   duration: 60 },
  { id: 'm10', name: 'Head & Face Massage',           gender: 'male',   duration: 20 },
  { id: 'm11', name: 'Face Bleach & D-Tan',           gender: 'male',   duration: 30 },
  { id: 'm12', name: 'Face Cleanup',                  gender: 'male',   duration: 30 },
  { id: 'm13', name: 'Facial',                        gender: 'male',   duration: 60 },
  { id: 'm14', name: 'Manicure',                      gender: 'male',   duration: 35 },
  { id: 'm15', name: 'Pedicure',                      gender: 'male',   duration: 45 },

  // ── Female Services ────────────────────────────────────────────
  { id: 'f1',  name: 'Haircut & Trim',                       gender: 'female', duration: 45  },
  { id: 'f2',  name: 'Kids Haircut',                          gender: 'female', duration: 45  },
  { id: 'f3',  name: 'Thermal Styling & Blow-dry',            gender: 'female', duration: 50  },
  { id: 'f4',  name: 'Root Touch-Up Color',                   gender: 'female', duration: 45  },
  { id: 'f5',  name: 'Global Hair Color',                     gender: 'female', duration: 120 },
  { id: 'f6',  name: 'Highlights & Balayage',                 gender: 'female', duration: 135 },
  { id: 'f7',  name: 'Hair Henna / Mehendi',                  gender: 'female', duration: 20  },
  { id: 'f8',  name: 'Hair Spa',                              gender: 'female', duration: 60  },
  { id: 'f9',  name: 'Hair Rebonding & Straightening',        gender: 'female', duration: 210 },
  { id: 'f10', name: 'Keratin & Hair Botox',                  gender: 'female', duration: 210 },
  { id: 'f11', name: 'Threading',                             gender: 'female', duration: 15  },
  { id: 'f12', name: 'Waxing',                                gender: 'female', duration: 30  },
  { id: 'f13', name: 'Face Bleach & D-Tan',                   gender: 'female', duration: 30  },
  { id: 'f14', name: 'Face Cleanup',                          gender: 'female', duration: 30  },
  { id: 'f15', name: 'Facial',                                gender: 'female', duration: 60  },
  { id: 'f16', name: 'Manicure',                              gender: 'female', duration: 35  },
  { id: 'f17', name: 'Pedicure',                              gender: 'female', duration: 50  },
  { id: 'f18', name: 'Gel Polish Application',                gender: 'female', duration: 60  },
  { id: 'f19', name: 'Nail Extensions',                       gender: 'female', duration: 90  },
  { id: 'f20', name: 'Full Body Massage',                     gender: 'female', duration: 60  },
  { id: 'f21', name: 'Body Exfoliation & Polishing',          gender: 'female', duration: 120 },
  { id: 'f22', name: 'Saree Draping',                         gender: 'female', duration: 30  },
  { id: 'f23', name: 'Party & Event Makeup',                  gender: 'female', duration: 90  },
  { id: 'f24', name: 'Bridal Makeup',                         gender: 'female', duration: 240 },
  { id: 'f25', name: 'Mehndi (Henna) Application',            gender: 'female', duration: 165 },

  // ── Cultural / Specialty (both genders) ───────────────────────
  { id: 'c1',  name: 'Mundan (Child\'s First Head Shave)',    gender: 'both', duration: 45 },
  { id: 'c2',  name: 'Aesthetic Piercing (Ear/Nose)',          gender: 'both', duration: 15 },
];

/**
 * Filter services by selected gender.
 * @param {'male'|'female'} gender
 * @returns {Array} filtered services
 */
export function getServicesByGender(gender) {
  if (!gender) return [];
  return SERVICES.filter(
    (s) => s.gender === gender || s.gender === 'both'
  );
}
