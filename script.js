document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selection ---
    const setSelect = document.getElementById('set-select');
    const cardGrid = document.getElementById('card-grid');
    const setNameElement = document.getElementById('set-name');
    const setInfoElement = document.getElementById('set-info');
    const exportLink = document.getElementById('export-link'); // This is the button triggering the modal now
    const collectedCountElement = document.getElementById('collected-count');
    const totalCountElement = document.getElementById('total-count');
    const percentageElement = document.getElementById('percentage');
    const progressElement = document.getElementById('progress');
    const loaderElement = document.getElementById('loader'); // Loader element
    const placeholderTextElement = document.querySelector('#card-grid .placeholder-text'); // Placeholder text

    // Modal Elements
    const exportModal = document.getElementById('export-modal');
    const modalCloseButton = document.getElementById('modal-close-button');
    const exportUrlDisplay = document.getElementById('export-url-display');
    const copyUrlButton = document.getElementById('copy-url-button');
    const openUrlButton = document.getElementById('open-url-button');
    const modalSetName = document.getElementById('modal-set-name'); // To display set name in modal


    // --- Constants and State Variables ---
    const API_BASE_URL = 'https://api.pokemontcg.io/v2';
    // Add your API Key here if you have one (recommended for higher limits)
    // const API_KEY = 'YOUR_API_KEY';
    const POKE_TCG_STORAGE_PREFIX = 'poketcg-tracker-';

    let currentSetId = null;
    let currentSetCards = []; // Store details of cards in the current set
    let collectedCards = new Set(); // Stores IDs of collected cards for the current set
    let generatedExportUrl = '#'; // Store the generated URL to pass to the modal

    // --- Initialization ---

    async function init() {
        // Set initial visual state first
        exportModal.style.display = 'none'; // Ensure modal is hidden initially
        loaderElement.style.display = 'none';
        if (placeholderTextElement) {
             placeholderTextElement.textContent = 'Please select a set from the dropdown menu.';
             placeholderTextElement.style.display = 'block'; // Explicitly show placeholder
        }
        // Ensure grid starts empty but contains the necessary structure elements
        cardGrid.innerHTML = '';
        if(placeholderTextElement) cardGrid.appendChild(placeholderTextElement);
        cardGrid.appendChild(loaderElement); // Make sure loader structure is in the DOM

        // Fetch sets and set up listeners
        await loadSets(); // Wait for sets to load into dropdown
        setupEventListeners();

        // THEN handle potential initial set loading from URL
        handleUrlChange();
    }

    async function loadSets() {
        console.log('Fetching sets...');
        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/sets?orderBy=releaseDate`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            console.log('Sets fetched:', data.data.length);
            populateSetDropdown(data.data);
        } catch (error) {
            console.error('Error loading sets:', error);
            setSelect.innerHTML = '<option value="">Error loading sets</option>';
             if (placeholderTextElement) {
                placeholderTextElement.textContent = 'Error loading sets. Please try refreshing.';
                placeholderTextElement.style.display = 'block';
            }
        }
    }

    function populateSetDropdown(sets) {
        setSelect.innerHTML = '<option value="">-- Select a Set --</option>'; // Clear loading/error message
        sets.reverse().forEach(set => { // Reverse to show newest first
            const option = document.createElement('option');
            option.value = set.id;
            option.textContent = `${set.name} (${set.series})`;
            option.dataset.total = set.totalCards;
            setSelect.appendChild(option);
        });
        console.log('Dropdown populated.');
    }

    function setupEventListeners() {
        setSelect.addEventListener('change', handleSetSelection);
        window.addEventListener('hashchange', handleUrlChange);
        cardGrid.addEventListener('click', handleCardClick);

        // --- MODIFIED Export Button Listener ---
        exportLink.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default link navigation
            // Use the stored generatedExportUrl
            if (currentSetId && generatedExportUrl !== '#' && generatedExportUrl !== window.location.href) {
                 showExportModal(generatedExportUrl); // Pass the stored URL
            } else {
                console.warn("Export link clicked but no valid export URL found/generated.");
                // Update alert message to be more accurate
                alert("Cannot export yet. Please select a set. If you have collected cards, the link should generate automatically.");
            }
        });

        // --- Modal Listeners ---
        modalCloseButton.addEventListener('click', hideExportModal);
        exportModal.addEventListener('click', (event) => {
            // Close modal if backdrop is clicked
            if (event.target === exportModal) {
                hideExportModal();
            }
        });
        copyUrlButton.addEventListener('click', copyUrlToClipboard);
        // Open button is an <a> tag, default behavior is fine once href is set

        console.log('Event listeners set up.');
    }

    // --- Set Loading and Display ---

    function handleSetSelection() {
        const selectedSetId = setSelect.value;
        console.log('Set selected:', selectedSetId);
        if (selectedSetId) {
            // Update URL hash to reflect selection and trigger loading via hashchange listener
            window.location.hash = selectedSetId;
        } else {
            // If "-- Select a Set --" is chosen, clear display and hash
             clearDisplay();
             window.location.hash = ''; // Clear hash
        }
    }

    // --- CORRECTED handleUrlChange ---
    function handleUrlChange() {
        // Get the full hash, remove the leading '#'
        const fullHash = window.location.hash.substring(1);

        // Split the hash at '?' to separate set ID and hash parameters
        const hashParts = fullHash.split('?');
        const setIdFromHash = hashParts[0]; // Part before '?' is the Set ID
        const hashQueryString = hashParts[1]; // Part after '?' contains parameters

        let collectedDataParam = null;
        let importedCardIds = null;

        // Parse parameters ONLY from the hash query string if it exists
        if (hashQueryString) {
            const hashParams = new URLSearchParams(hashQueryString);
            collectedDataParam = hashParams.get('collected'); // Get 'collected' from hash params
            console.log(`Hash query string found: ${hashQueryString}. 'collected' param value: ${collectedDataParam ? 'present' : 'null/empty'}`); // Log if found
        } else {
            console.log("No query string found in hash.");
        }

        // Now log the correctly parsed values
        console.log(`URL change processed. SetID: ${setIdFromHash}, Collected param found in hash: ${collectedDataParam ? 'yes' : 'no'}`);


        // Parse import data if the parameter was found in the hash
        if (collectedDataParam) {
            console.log("Attempting to parse collection data from URL parameter (found in hash).");
            importedCardIds = parseImportData(collectedDataParam); // Try parsing immediately
            if (!importedCardIds) {
                console.warn("Failed to parse collection data from URL hash, proceeding without import.");
                // Optionally clear the bad param from hash? More complex URL manipulation needed.
            }
        }

        // The rest of the logic remains the same as the previous fix:
        // Check if set needs loading based on setIdFromHash
        if (setIdFromHash && typeof setIdFromHash === 'string' && setIdFromHash.trim() !== '') {
            const targetSetId = setIdFromHash.trim();
            if (targetSetId !== currentSetId) {
                console.log(`Loading new set from URL: ${targetSetId}`);
                // Pass imported data (or null) to loadSet
                loadSet(targetSetId, importedCardIds)
                    .then(() => {
                        console.log(`Set ${targetSetId} loaded successfully.`);
                        // Import logic is handled inside loadSet before rendering.
                        // Optional: Clear the query part from hash after successful import?
                        // Be careful modifying hash - might trigger another hashchange if not done carefully
                        // if (importedCardIds) {
                        //    history.replaceState(null, '', window.location.pathname + '#' + targetSetId);
                        // }
                    })
                    .catch(error => {
                        console.error("Error loading set from URL hash:", error);
                        clearDisplay();
                        alert(`Failed to load set '${targetSetId}' from URL.`);
                    });
            } else if (importedCardIds && targetSetId === currentSetId) {
                // If set is already loaded, but URL has new data (e.g., user pasted/edited link)
                // Use applyImportedCollection for an immediate UI update without full reload.
                console.log("Applying collection data from URL parameter to currently loaded set (using applyImportedCollection).");
                 applyImportedCollection(importedCardIds);
                 // Optional: Clear the query part from hash
                 // history.replaceState(null, '', window.location.pathname + '#' + currentSetId);
            }
            // If targetSetId === currentSetId and no import data, do nothing.
        } else if (currentSetId !== null && !setIdFromHash) { // Hash is empty or invalid, but a set was loaded
            console.log("URL Hash is empty or invalid, clearing display.");
            clearDisplay();
        }
        // If hash is empty/invalid AND no set was loaded (initial state), do nothing here, init handles it.
    }


    // loadSet remains unchanged from previous version (accepts importedCollectionData)
    async function loadSet(setId, importedCollectionData = null) { // Accept optional second argument
        if (!setId) {
           console.warn("loadSet called with empty setId, clearing display.");
           clearDisplay();
           return;
        }

        console.log(`Loading set: ${setId}`);
        currentSetId = setId;
        setSelect.value = setId; // Ensure dropdown matches loaded set
        showLoadingIndicator(); // Shows the CSS loader
        progressElement.style.display = 'none'; // Hide progress during load
        exportLink.style.display = 'none'; // Hide export button initially
        generatedExportUrl = '#'; // Reset export URL for new set

        // Initialize collection state PRIORITIZING import data
        if (importedCollectionData && Array.isArray(importedCollectionData)) {
            // Initialize directly from imported data
            collectedCards = new Set(importedCollectionData);
            console.log(`Initialized collection from URL parameter data (${collectedCards.size} cards).`);
            // Save the imported collection to storage immediately (for the private session)
            saveCollectionToStorage();
        } else {
            // No valid import data passed, load from storage as usual (fallback)
            console.log("No valid import data from URL, loading collection from localStorage.");
            loadCollectionFromStorage(); // This will be empty in a fresh private tab if no prior saves
        }

        try {
            // Fetch cards and details concurrently
            const [cards, setDetails] = await Promise.all([
                fetchAllCardsForSet(setId),
                fetchSetDetails(setId)
            ]);

            currentSetCards = cards;
            console.log(`Workspaceed ${currentSetCards.length} cards for set ${setId}.`);

            // Update Header info
            setNameElement.textContent = setDetails?.name || setId;
            setInfoElement.textContent = `Series: ${setDetails?.series || 'N/A'} | Released: ${setDetails?.releaseDate || 'N/A'} | Total Cards (API): ${setDetails?.printedTotal || setDetails?.totalCards || 'N/A'}`; // Prefer printedTotal

            // Render the grid - uses the collectedCards set initialized above
            renderCardGrid();
            updateProgress();
            updateExportLink(); // Generate URL based on the (potentially imported) collection

            // Show controls now that loading is complete
            progressElement.style.display = 'block';
            // updateExportLink will handle showing the export button if applicable

        } catch (error) {
            console.error(`Error loading set ${setId}:`, error);
            loaderElement.style.display = 'none'; // Explicitly hide loader on error
            if(placeholderTextElement) placeholderTextElement.style.display = 'none'; // Hide placeholder
            // Display error message directly in the grid area
            cardGrid.innerHTML = `<p class="placeholder-text" style="display: block; color: var(--primary-color);">Error loading cards for set ${setId}. Please check the console or try again.</p>`;
             if(placeholderTextElement) cardGrid.appendChild(placeholderTextElement); // Ensure structure is present
             cardGrid.appendChild(loaderElement);
            setNameElement.textContent = 'Error Loading Set';
            setInfoElement.textContent = 'Could not load set details.';
            progressElement.style.display = 'none';
            exportLink.style.display = 'none';
        }
    }


    async function fetchSetDetails(setId) {
         try {
            const response = await fetchWithAuth(`${API_BASE_URL}/sets/${setId}`);
            if (!response.ok) throw new Error(`HTTP error fetching set details! status: ${response.status}`);
            const data = await response.json();
            return data.data;
         } catch (error) {
             console.error(`Error fetching details for set ${setId}:`, error);
             // Return null or a default object might be better depending on usage
             return { name: setId, series: 'Unknown', releaseDate: 'Unknown', totalCards: 'N/A' };
         }
    }

    async function fetchAllCardsForSet(setId) {
        let allCards = [];
        let page = 1;
        const pageSize = 250; // Max allowed by API
        let hasMore = true;
        console.log(`Workspaceing cards for ${setId}, page ${page}`);

        while(hasMore) {
            const url = `${API_BASE_URL}/cards?q=set.id:${setId}&page=${page}&pageSize=${pageSize}&orderBy=number`;
            try {
                const response = await fetchWithAuth(url);
                if (!response.ok) throw new Error(`HTTP error fetching cards! status: ${response.status}`);
                const data = await response.json();
                if (!data || !Array.isArray(data.data)) {
                     throw new Error("Invalid data structure received from API");
                }
                allCards = allCards.concat(data.data);
                // Use data.totalCount to determine if more pages exist
                hasMore = data.page * data.pageSize < data.totalCount;
                if (hasMore) {
                    page++;
                    console.log(`Workspaceing cards for ${setId}, page ${page}`);
                } else {
                    console.log(`Finished fetching cards for ${setId}. Total: ${allCards.length}`);
                }

            } catch (error) {
                console.error(`Error fetching page ${page} for set ${setId}:`, error);
                throw error; // Re-throw error to be caught by loadSet
            }
        }
        // Sort cards numerically within the set (API `orderBy=number` helps, but JS sort ensures)
        allCards.sort((a, b) => {
            // Try converting number to integer for robust sorting
            const numA = parseInt(a.number, 10);
            const numB = parseInt(b.number, 10);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            // Fallback to string comparison if numbers are not standard integers
            return a.number.localeCompare(b.number, undefined, { numeric: true });
        });
        return allCards;
    }

     function renderCardGrid() {
        loaderElement.style.display = 'none'; // Hide loader
        if (placeholderTextElement) placeholderTextElement.style.display = 'none'; // Hide placeholder
        cardGrid.innerHTML = ''; // Clear grid (loader/placeholder structures were potentially added before)

        // Re-add the structure elements (hidden loader, potential placeholder)
        if(placeholderTextElement) cardGrid.appendChild(placeholderTextElement);
        cardGrid.appendChild(loaderElement);

        if (currentSetCards.length === 0) {
             if (placeholderTextElement) {
                placeholderTextElement.textContent = 'No cards found for this set.';
                placeholderTextElement.style.display = 'block'; // Show specific message
            }
            return;
        }

        // Create a document fragment for performance when adding many cards
        const fragment = document.createDocumentFragment();
        currentSetCards.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.classList.add('card');
            cardElement.dataset.cardId = card.id; // Use the unique card ID

            const img = document.createElement('img');
            img.src = card.images.small;
            img.alt = `${card.name} (${card.number})`;
            img.title = `${card.name} (${card.number})`; // Add tooltip
            img.loading = 'lazy'; // Lazy load images

            cardElement.appendChild(img);

            // Apply collected style IF the card is in the (now correctly initialized) set
            if (collectedCards.has(card.id)) {
                cardElement.classList.add('collected');
            }

            fragment.appendChild(cardElement); // Add card to fragment
        });

        cardGrid.appendChild(fragment); // Append all cards at once
        console.log('Card grid rendered.');
    }

    function showLoadingIndicator() {
        cardGrid.innerHTML = ''; // Clear previous grid content completely
        if(placeholderTextElement) cardGrid.appendChild(placeholderTextElement);
        cardGrid.appendChild(loaderElement); // Ensure structure is present

        loaderElement.style.display = 'flex'; // Show the loader (use flex as defined in CSS)
        if (placeholderTextElement) placeholderTextElement.style.display = 'none'; // Hide placeholder text
        setNameElement.textContent = 'Loading...';
        setInfoElement.textContent = '';
        console.log('Showing loading indicator.');
    }

    function clearDisplay() {
        console.log('Clearing display.');
        setNameElement.textContent = 'Select a set';
        setInfoElement.textContent = '';
        loaderElement.style.display = 'none'; // Ensure loader is hidden

        // Clear the grid content BUT keep the placeholder and loader structure
        cardGrid.innerHTML = '';
        if(placeholderTextElement) cardGrid.appendChild(placeholderTextElement);
        cardGrid.appendChild(loaderElement);

        if(placeholderTextElement) {
            placeholderTextElement.textContent = 'Please select a set from the dropdown menu.';
            placeholderTextElement.style.display = 'block'; // Make placeholder visible
        }

        currentSetId = null;
        currentSetCards = [];
        collectedCards.clear();
        progressElement.style.display = 'none';
        exportLink.style.display = 'none'; // Hide export button
        generatedExportUrl = '#'; // Reset stored URL
        if (setSelect.value !== "") { // Only reset dropdown if a set was actually selected
           setSelect.value = '';
        }
    }

    // --- Collection Management ---

    function handleCardClick(event) {
        const cardElement = event.target.closest('.card'); // Find the nearest parent with class 'card'
        if (!cardElement || !currentSetId) return; // Exit if click wasn't on a card or no set loaded

        const cardId = cardElement.dataset.cardId;
        console.log(`Card clicked: ${cardId}`);

        // Toggle collection status
        if (collectedCards.has(cardId)) {
            collectedCards.delete(cardId);
            cardElement.classList.remove('collected');
            console.log(`Card removed: ${cardId}`);
        } else {
            collectedCards.add(cardId);
            cardElement.classList.add('collected');
             console.log(`Card added: ${cardId}`);
        }

        saveCollectionToStorage();
        updateProgress();
        updateExportLink(); // Regenerate URL and update button state
    }

    function saveCollectionToStorage() {
        if (!currentSetId) return;
        const storageKey = POKE_TCG_STORAGE_PREFIX + currentSetId;
        try {
            const collectedArray = Array.from(collectedCards);
            localStorage.setItem(storageKey, JSON.stringify(collectedArray));
            console.log(`Collection saved for ${currentSetId} (${collectedArray.length} cards)`);
        } catch (error) {
             console.error(`Error saving collection to localStorage for ${currentSetId}:`, error);
             // Maybe inform the user if storage is full?
             alert("Could not save collection data. Local storage might be full or disabled.");
        }
    }

    function loadCollectionFromStorage() {
        // This is now primarily a fallback if no URL import data is provided
        if (!currentSetId) return;
        const storageKey = POKE_TCG_STORAGE_PREFIX + currentSetId;
        const storedData = localStorage.getItem(storageKey);
        // Reset here ensures we don't merge with potentially stale data
        // (although the logic in loadSet should prevent this call if import data exists)
        collectedCards = new Set();
        if (storedData) {
            try {
                const cardIds = JSON.parse(storedData);
                if (Array.isArray(cardIds)) { // Basic validation
                     collectedCards = new Set(cardIds); // Load into the Set
                     console.log(`Collection loaded from localStorage for ${currentSetId} (${collectedCards.size} cards)`);
                } else {
                    console.warn(`Invalid data found in localStorage for ${currentSetId}. Ignoring.`);
                    localStorage.removeItem(storageKey); // Clear invalid data
                }
            } catch (error) {
                console.error(`Error parsing collection from localStorage for ${currentSetId}:`, error);
                collectedCards = new Set(); // Reset if data is corrupt
                localStorage.removeItem(storageKey); // Clear corrupted data
            }
        } else {
            console.log(`No collection data found in localStorage for ${currentSetId}.`);
        }
    }

    // Used for applying import data when the set is already loaded (e.g., pasting URL)
    function applyImportedCollection(importedCardIds) {
         if (!currentSetId || !Array.isArray(importedCardIds)) {
             console.warn("Apply import failed: Invalid data or no current set.");
             return;
         }

         console.log(`Applying imported collection to current view (${importedCardIds.length} cards)`);
         // Basic validation of imported IDs (optional, but good practice)
         const validIds = importedCardIds.filter(id => typeof id === 'string');
         collectedCards = new Set(validIds); // Overwrite current collection state

         // Update UI based on new collection data
         document.querySelectorAll('.card').forEach(cardElement => {
            const cardId = cardElement.dataset.cardId;
            if (collectedCards.has(cardId)) {
                cardElement.classList.add('collected');
            } else {
                cardElement.classList.remove('collected');
            }
         });

         saveCollectionToStorage(); // Save the newly applied collection
         updateProgress();
         updateExportLink();
         console.log("Import applied successfully to current view.");
    }


    // --- Progress Update ---

    function updateProgress() {
        if (!currentSetId || currentSetCards.length === 0) {
             progressElement.style.display = 'none';
             return;
        }
        const total = currentSetCards.length;
        const collected = collectedCards.size;
        const percentage = total > 0 ? ((collected / total) * 100).toFixed(1) : 0;
        collectedCountElement.textContent = collected;
        totalCountElement.textContent = total;
        percentageElement.textContent = percentage;
        progressElement.style.display = 'block'; // Ensure visible
    }

    // --- Export/Import via URL ---

    function generateExportData() {
        if (!currentSetId) return '';
        const collectedIdsArray = Array.from(collectedCards);
        if (collectedIdsArray.length === 0) return ''; // No data to export

        try {
            const jsonString = JSON.stringify(collectedIdsArray);
            const compressed = pako.deflate(jsonString); // Use default options for Uint8Array output
            // Convert Uint8Array to binary string for btoa
            let binaryString = '';
             for (let i = 0; i < compressed.length; i++) {
                 binaryString += String.fromCharCode(compressed[i]);
             }
            // Encode the binary string using Base64
            const base64Encoded = btoa(binaryString);
            // Make it URL safe
            const urlSafeBase64 = base64Encoded
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            return urlSafeBase64;
        } catch (error) {
             console.error("Error generating export data:", error);
             return '';
        }
    }

     // Updates the stored URL variable and visibility of the export button
     function updateExportLink() {
        if (!currentSetId) {
            exportLink.style.display = 'none';
            generatedExportUrl = '#';
            return;
        }

        const exportData = generateExportData();
        if(exportData) {
            const baseUrl = window.location.origin + window.location.pathname;
            // Use encodeURIComponent on the generated base64 data just in case any stray characters exist
            generatedExportUrl = `${baseUrl}#${currentSetId}?collected=${encodeURIComponent(exportData)}`;
            // Make the button visible now that we have a URL
            exportLink.style.display = 'inline-block';
            console.log("Export URL generated and button shown.");
        } else {
            // Hide button if there's no data to export
            exportLink.style.display = 'none';
            generatedExportUrl = '#';
             console.log("No export data, hiding export button.");
        }
    }

    function parseImportData(encodedData) {
        if (!encodedData || typeof encodedData !== 'string') {
            console.warn("ParseImportData: Invalid input data type.");
            return null;
        };
        try {
             // Decode URL component first in case it was encoded (like from updateExportLink)
             let base64 = decodeURIComponent(encodedData);

             // Add back URL-unsafe characters and padding for base64 decoding
            base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
                base64 += '=';
            }

            // Decode Base64 -> binary string
            const binaryString = atob(base64);

             // Convert binary string back to Uint8Array for pako
             const len = binaryString.length;
             const bytes = new Uint8Array(len);
             for (let i = 0; i < len; i++) {
                 bytes[i] = binaryString.charCodeAt(i);
             }

            // Decompress using pako (inflate)
            const jsonString = pako.inflate(bytes, { to: 'string' });

            // Parse the JSON string back into an array
            const cardIds = JSON.parse(jsonString);

            // Validation
            if (!Array.isArray(cardIds)) {
                throw new Error("Decoded data is not an array.");
            }
            // Basic check: ensure all items in array are strings
            if (!cardIds.every(id => typeof id === 'string')) {
                 throw new Error("Invalid card ID format in decoded data (items are not strings).");
             }

            console.log(`Parsed import data successfully: ${cardIds.length} card IDs`);
            return cardIds; // Return the array of IDs
        } catch (error) {
            console.error("Error parsing import data:", error);
            // Don't alert here, let the calling function handle null return
            return null; // Indicate failure
        }
    }


    // --- Modal Functions ---
    function showExportModal(url) {
        console.log("Showing export modal.");
        exportUrlDisplay.value = url;
        openUrlButton.href = url; // Set href for the 'Open' button

        // Get cleaner set name for modal title
        const selectedOption = setSelect.options[setSelect.selectedIndex];
        modalSetName.textContent = selectedOption ? selectedOption.text.split(' (')[0] : currentSetId; // Extract name before " (Series)"

        // Reset copy button state visually
        copyUrlButton.textContent = ''; // Clear text to re-add with icon
        copyUrlButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 5px;">
              <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
              <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
            </svg>
            Copy URL`;
        copyUrlButton.classList.remove('copied');
        copyUrlButton.disabled = false;

        exportModal.style.display = 'flex'; // Show modal using flex
    }

    function hideExportModal() {
        console.log("Hiding export modal.");
        exportModal.style.animation = 'fadeOutModal 0.3s ease-out forwards'; // Optional: Add fade-out
        // Hide after animation - adjust time to match CSS animation duration
        setTimeout(() => {
             exportModal.style.display = 'none';
             exportModal.style.animation = ''; // Reset animation property
        }, 300); // 300ms matches CSS animation duration (if added)
    }

    async function copyUrlToClipboard() {
        const urlToCopy = exportUrlDisplay.value;
        // Check if Clipboard API is available
        if (!navigator.clipboard) {
            console.warn('Clipboard API not available.');
            // Fallback: Select text for manual copy? Or just alert.
            try {
                 exportUrlDisplay.select(); // Select the text in the input
                 // document.execCommand('copy'); // Deprecated, avoid if possible
                 alert('Clipboard API not supported. URL selected. Press Ctrl+C (or Cmd+C) to copy.');
            } catch (err) {
                 alert('Failed to copy automatically. Please select the URL and copy it manually.');
            }
            return;
        }

        // Use modern Clipboard API
        try {
            await navigator.clipboard.writeText(urlToCopy);
            console.log('URL copied to clipboard:', urlToCopy);

            // Provide visual feedback
            copyUrlButton.textContent = ''; // Clear to re-add icon + text
            copyUrlButton.innerHTML = `
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 5px;" viewBox="0 0 16 16">
                   <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                 </svg>
                 Copied!`;
            copyUrlButton.classList.add('copied');
            copyUrlButton.disabled = true; // Briefly disable

            // Reset button after a short delay
            setTimeout(() => {
                 copyUrlButton.textContent = ''; // Clear again
                 copyUrlButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 5px;">
                      <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                      <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                    Copy URL`;
                 copyUrlButton.classList.remove('copied');
                 copyUrlButton.disabled = false;
            }, 2000); // Reset after 2 seconds

        } catch (err) {
            console.error('Failed to copy URL using Clipboard API: ', err);
            alert('Failed to copy URL automatically. Please select the URL and copy it manually.');
        }
    }


    // --- API Helper ---
    async function fetchWithAuth(url) {
        const headers = {
            'Accept': 'application/json'
            // If using an API Key, add it here:
            // 'X-Api-Key': API_KEY
        };
        // console.log(`Workspaceing: ${url}`); // Uncomment for detailed fetch logging
        return fetch(url, { headers });
    }

    // --- Start the application ---
    console.log('Starting application init...');
    init();
});