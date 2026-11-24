export const TRAVELER_NAMES=Object.freeze({'10000005':'Aether','10000007':'Lumine'});
export const characterName=(id,fallback)=>TRAVELER_NAMES[String(id)]??fallback;
