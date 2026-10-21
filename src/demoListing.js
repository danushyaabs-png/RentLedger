// Random demo listing for quick demos: name, neighbourhood, Google Maps link and prices.
// Locations are neighbourhoods, not anyone's real address. Photos are added by hand.

const PLACES = [
  ["Koramangala", "Bengaluru", "Karnataka"],
  ["Indiranagar", "Bengaluru", "Karnataka"],
  ["Whitefield", "Bengaluru", "Karnataka"],
  ["HSR Layout", "Bengaluru", "Karnataka"],
  ["Anna Nagar", "Chennai", "Tamil Nadu"],
  ["Besant Nagar", "Chennai", "Tamil Nadu"],
  ["Velachery", "Chennai", "Tamil Nadu"],
  ["Sholinganallur", "Chennai", "Tamil Nadu"],
  ["Adyar", "Chennai", "Tamil Nadu"],
  ["RS Puram", "Coimbatore", "Tamil Nadu"],
  ["Gachibowli", "Hyderabad", "Telangana"],
  ["Jubilee Hills", "Hyderabad", "Telangana"],
  ["Kondapur", "Hyderabad", "Telangana"],
  ["Bandra West", "Mumbai", "Maharashtra"],
  ["Powai", "Mumbai", "Maharashtra"],
  ["Andheri East", "Mumbai", "Maharashtra"],
  ["Koregaon Park", "Pune", "Maharashtra"],
  ["Baner", "Pune", "Maharashtra"],
  ["Hauz Khas", "New Delhi", "Delhi"],
  ["Saket", "New Delhi", "Delhi"],
  ["Salt Lake", "Kolkata", "West Bengal"],
  ["Kakkanad", "Kochi", "Kerala"],
  ["Panjim", "Goa", "Goa"],
  ["Vaishali Nagar", "Jaipur", "Rajasthan"],
];

const NAMES = [
  "Sunlit 2BHK apartment",
  "Cosy studio near the metro",
  "3BHK villa with garden",
  "Modern 1BHK with balcony",
  "Spacious 3BHK family home",
  "Quiet 2BHK near the park",
  "Independent house with terrace",
  "Furnished 2BHK flat",
  "Bright duplex with parking",
  "Compact 1RK for students",
  "Lake-view 2BHK",
  "Garden cottage",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Text fields only (instant). */
export function demoFields() {
  const [area, city, state] = pick(PLACES);
  const name = `${pick(NAMES)} in ${area}`;
  const location = `${area}, ${city}, ${state}`;
  const rentSteps = [0.0005, 0.0008, 0.001, 0.0012, 0.0015, 0.002, 0.0025, 0.003];
  const rent = pick(rentSteps);
  const deposit = Math.round(rent * pick([2, 2, 3]) * 1e6) / 1e6;
  return {
    name,
    location,
    rent: String(rent),
    deposit: String(deposit),
    lateFee: String(pick([5, 5, 10, 10, 15])),
    mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`,
  };
}
