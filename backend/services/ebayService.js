// services/ebayService.js

function ebayNotReady() {
    throw new Error("eBay API not enabled yet (developer approval pending)");

}

async function searchItems() {
    ebayNotReady();
}

module.exports = { searchItems };
