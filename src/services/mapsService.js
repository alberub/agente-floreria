const { mapsApiKey } = require("../config/env");

const GOOGLE_GEOCODE_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";
const MONTERREY_METRO_MUNICIPALITIES = new Set([
  "apodaca",
  "cadereyta jimenez",
  "garcia",
  "general escobedo",
  "guadalupe",
  "juarez",
  "monterrey",
  "san nicolas de los garza",
  "san pedro garza garcia",
  "santa catarina",
  "santiago",
]);

function normalizeLocationName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findAddressComponent(components, type) {
  return components.find((component) => component.types?.includes(type)) || null;
}

function getMunicipalityName(components) {
  const locality =
    findAddressComponent(components, "locality") ||
    findAddressComponent(components, "administrative_area_level_2");

  return locality?.long_name || null;
}

function isWithinMonterreyMetro(components) {
  const municipalityName = getMunicipalityName(components);

  if (!municipalityName) {
    return {
      municipality: null,
      withinMetro: false,
    };
  }

  return {
    municipality: municipalityName,
    withinMetro: MONTERREY_METRO_MUNICIPALITIES.has(
      normalizeLocationName(municipalityName)
    ),
  };
}

async function geocodeAddress(address) {
  if (!mapsApiKey) {
    throw new Error("Falta MAPS_API_KEY para validar direcciones.");
  }

  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set("address", String(address || "").trim());
  url.searchParams.set("key", mapsApiKey);
  url.searchParams.set("region", "mx");
  url.searchParams.set("components", "country:MX");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Error consultando Google Maps: ${response.status} ${response.statusText}`
    );
  }

  const payload = await response.json();

  if (payload.status !== "OK" || !Array.isArray(payload.results)) {
    return {
      ok: false,
      status: payload.status || "UNKNOWN_ERROR",
      result: null,
    };
  }

  const firstResult = payload.results[0];
  const addressComponents = Array.isArray(firstResult.address_components)
    ? firstResult.address_components
    : [];
  const metroValidation = isWithinMonterreyMetro(addressComponents);

  return {
    ok: true,
    status: payload.status,
    result: {
      formattedAddress: firstResult.formatted_address || null,
      location: {
        lat: firstResult.geometry?.location?.lat ?? null,
        lng: firstResult.geometry?.location?.lng ?? null,
      },
      locationType: firstResult.geometry?.location_type || null,
      partialMatch: Boolean(firstResult.partial_match),
      placeId: firstResult.place_id || null,
      addressComponents,
      municipality: metroValidation.municipality,
      withinMonterreyMetro: metroValidation.withinMetro,
      types: Array.isArray(firstResult.types) ? firstResult.types : [],
    },
  };
}

module.exports = {
  geocodeAddress,
};
