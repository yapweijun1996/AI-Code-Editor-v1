var KEY = "20250710";
// Create a TextEncoder instance
const encoder = new TextEncoder();
// Create a TextDecoder instance
const decoder = new TextDecoder();
// Decrypt function
function decrypt(ciphertext) {
	let decodedMessage = '';
	for (let i = 0; i < ciphertext.length; i += 3) {
		let numStr = ciphertext.slice(i, i + 3);
		let encryptedChar = parseInt(numStr);
		let keyChar = KEY.charCodeAt((i / 3) % KEY.length);
		let decryptedChar = encryptedChar ^ keyChar;
		decodedMessage += String.fromCharCode(decryptedChar);
	}
	return decoder.decode(new Uint8Array(encoder.encode(decodedMessage)));
}
var apiKeys = [
  "115121072084099078114106098029005120126090119105075090121123125069122116094086126071121120084125067121099109004000086", // can share
  "115121072084099078115106107073097127003091070122066093074007070026117113095097102119085065092117113084101066074065070", // can share
  "115121072084099078114097099127070118103026064074004096070122002002087007103088084003008127114120091091120086009097120", // can share
  "115121072084099078112087123009010101067005112087007070074121100090101122093126117126090123065005000125106000093100001",
  "115121072084099078112086102084119109096092067007091073086111074081085090000123064101094104067095100095099112095084112",
  "115121072084099078112120081120003090101067085114122085001087007082000125123126068099006113121007072089125088104103104",
  "115121072084099078115090103085089007066125116103095116006088082064107119071113007068088004082086005125094003082003009",
  "115121072084099078112084070127089006114014071074099121072093072070124073112003101071120090127029125099075013101089104"
];


let currentKeyIndex = 0;

async function sendApiRequest(url, requestBody) {
  let tries = 0;
  const maxTries = apiKeys.length;

  while (tries < maxTries) {
    var apiKey = apiKeys[currentKeyIndex];
	apiKey = decrypt(apiKey);
	
    const fullUrl = url + "?key=" + apiKey;

    console.log(`Using API key #${currentKeyIndex + 1}: ${apiKey}`);

    try {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        console.log(`API key #${currentKeyIndex + 1} succeeded.`);
        const data = await response.json();
        return data;
      } else {
        console.warn(`API key #${currentKeyIndex + 1} failed with status ${response.status}`);
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        tries++;
      }
    } catch (err) {
      console.error(`API key #${currentKeyIndex + 1} request error: ${err.message}`);
      currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
      tries++;
    }
  }
  throw new Error("All API keys failed.");
}