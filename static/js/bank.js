document.addEventListener("DOMContentLoaded", function() {
    console.log("Bank tracker initialized");
    
    // Initialize Select2 components
    initializeSelect2();
    
    // Initialize Handsontable
    initializeBankHandsontable();
});

// Global variables to store the current state and change history
let undoStack = [];
let redoStack = [];
let currentState = [];  // Current state of the table data
let hot; // Global reference to Handsontable instance

// Function to fetch all bank transaction data
function fetchAllBankTransactions() {
    console.log("Starting to fetch bank transactions...");
    return fetch(`/get_all_bank_transactions`)
        .then(response => {
            console.log("Received response with status:", response.status);
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Parsed response data:", data);
            if (!data) {
                console.error("Server returned null or undefined data");
                return [];
            }
            if (data.error) {
                console.error('Error from server:', data.error);
                alert('Error fetching bank transaction data: ' + data.error);
                return [];
            }
            console.log(`Fetched ${data.length} bank transactions`);
            return data;
        })
        .catch(error => {
            console.error("Error fetching bank transaction data:", error);
            alert('Error fetching bank transaction data: ' + error.message);
            return [];
        });
}

// Function to fetch data and initialize Handsontable with filters
// Function to fetch data and initialize Handsontable with filters
function initializeBankHandsontable() {
    console.log("Initializing bank table...");
    fetchAllBankTransactions().then(transactionsData => {
        console.log("Transaction data received:", transactionsData);
        
        // Check if data is an array
        if (!Array.isArray(transactionsData)) {
            console.error("Data is not an array:", transactionsData);
            // Display a message in the table area
            document.getElementById('bank-table').innerHTML = 
                '<div class="alert alert-warning">No transaction data available. The server may be unavailable or returned invalid data.</div>';
            return;
        }
        
        // Check if array is empty
        if (transactionsData.length === 0) {
            console.log("No transactions found in the data");
            // Display a message in the table area
            document.getElementById('bank-table').innerHTML = 
                '<div class="alert alert-info">No transactions found. Add new transactions to get started.</div>';
            return;
        }

        var container = document.getElementById('bank-table');
        
        // Clear any previous content
        container.innerHTML = '';
        
        // Destroy existing instance if it exists
        if (hot) {
            hot.destroy();
        }
        
        let isUndoRedoAction = false; // Flag to prevent recording undo/redo as changes
        
        // Clone initial data for state tracking
        let initialState = JSON.parse(JSON.stringify(transactionsData));
        
        // Store the data separately so we can access it in the cells callback
        let tableData = transactionsData;
        
        hot = new Handsontable(container, {
            licenseKey: 'non-commercial-and-evaluation',
            data: transactionsData,
            columns: [
                { data: 'id', type: 'numeric' },
                { data: 'date', type: 'date', dateFormat: 'YYYY-MM-DD' },
                { data: 'type', type: 'dropdown', source: ['deposit', 'withdrawal'] },
                { data: 'amount', type: 'numeric' },
                { data: 'site', type: 'text' },
                { 
                    data: null, // No associated data field
                    renderer: deleteButtonRenderer // Custom delete button renderer
                }
            ],
            colWidths: [null, null, null, null, null, 17],  // Only 'Win' column has a fixed width
            colHeaders: ["ID", "Date", "Type", "Amount", "Site", ""],
            rowHeaders: true,
            columnSorting: true,
            filters: true,
            dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
            editable: true,
            manualColumnResize: true,
            manualRowResize: true,
            autoColumnSize: true,
            outsideClickDeselects: false,
            columnSorting: {
                initialConfig: {
                    column: 1, // The index of the "Date" column (0-based index)
                    sortOrder: 'desc' // Sort in descending order (newest dates first)
                }
            },
            stretchH: 'all', // Stretch columns to fill width
            
            // Add safe event handlers
            afterOnCellMouseDown: function(event, coords, TD) {
                // Handle mousedown event safely
                if (!event) return;
                // Additional code if needed
            },
            
            afterOnCellMouseUp: function(event, coords, TD) {
                // Handle mouseup event safely
                if (!event) return;
                // Additional code if needed
            },
            
            beforeChange: function(changes, source) {
                if (!changes) return; // Guard against undefined
                
                if (source === 'edit' && !isUndoRedoAction) {
                    try {
                        // Store the current state before any changes
                        const currentData = JSON.parse(JSON.stringify(hot.getData().map(row => {
                            const obj = {};
                            hot.getSettings().columns.forEach((col, index) => {
                                obj[col.data] = row[index];
                            });
                            return obj;
                        })));
                        
                        // Push current state to undo stack before change
                        undoStack.push(currentData);
                        
                        // Clear redo stack since we've made a new change
                        redoStack = [];
                        
                        console.log("State saved to undo stack");
                    } catch (error) {
                        console.error("Error in beforeChange:", error);
                    }
                }
            },
            
            afterChange: function(changes, source) {
                if (!changes) return; // Guard against undefined
                
                if (source === 'edit' && !isUndoRedoAction) {
                    try {
                        // Save changes to server after edit
                        saveChangesToServer(hot.getData());
                    } catch (error) {
                        console.error("Error in afterChange:", error);
                    }
                }
            },
            
            // Fixed cells callback that safely accesses the data
            cells: function(row, col, prop) {
                const cellProperties = {};
                
                if (col === 2) { // Type column
                    try {
                        // Access tableData directly rather than using hot.getSourceDataAtRow
                        if (tableData && tableData[row] && tableData[row].type) {
                            cellProperties.className = tableData[row].type.toLowerCase();
                        }
                    } catch (error) {
                        console.error("Error in cells callback:", error);
                    }
                }
                
                return cellProperties;
            }
        });

        // Custom renderer for delete button
        function deleteButtonRenderer(instance, td, row, col, prop, value, cellProperties) {
            td.innerHTML = `<button class="delete-btn">🗑️</button>`;
            td.classList.add("htCenter", "htMiddle"); // Align button in the center

            // Attach event listener (remove previous event listeners first)
            setTimeout(() => {
                const button = td.querySelector(".delete-btn");
                if (button) {
                    button.onclick = function () {
                        deleteRow(row);
                    };
                }
            }, 0);
        }

        // Function to delete row
        function deleteRow(rowIndex) {
            const rowData = hot.getSourceDataAtRow(rowIndex); // Get row data
            if (!rowData || !rowData.id) return; // Ensure valid data

            const transactionId = rowData.id; // Get transaction ID
            if (!transactionId) return;

            // Confirm deletion
            if (!confirm("Are you sure you want to delete this row?")) return;

            // Send delete request to the server with the correct transaction ID
            fetch(`/delete_bank_transaction/${transactionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    console.log("Row deleted successfully!");
                    // Refresh the entire table instead of just removing the row
                    fetchAllBankTransactions().then(updatedData => {
                        if (updatedData) {
                            hot.loadData(updatedData);
                            hot.render(); // Force a render of the table
                        }
                    });
                } else {
                    console.error("Error deleting row:", data.error);
                    alert("Error deleting row: " + (data.error || "Unknown error"));
                }
            })
            .catch(error => {
                console.error("Error:", error.message);
                alert("Error deleting row: " + error.message);
            });
        }


        // Add undo functionality to the undo button
        document.getElementById('undo-btn').addEventListener('click', function(e) {
            // Prevent any default actions and stop propagation
            e.preventDefault();
            e.stopPropagation();
            
            console.log("Undo button clicked. Stack size:", undoStack.length);
            if (undoStack.length > 0) {
                try {
                    // Get current state to save to redo stack
                    const currentData = JSON.parse(JSON.stringify(hot.getData().map(row => {
                        const obj = {};
                        hot.getSettings().columns.forEach((col, index) => {
                            obj[col.data] = row[index];
                        });
                        return obj;
                    })));
                    
                    // Save current state to redo stack
                    redoStack.push(currentData);
                    
                    // Get previous state from undo stack
                    const previousState = undoStack.pop();
                    
                    // Set flag to prevent recording this as a change
                    isUndoRedoAction = true;
                    
                    // Update the table with previous state
                    hot.loadData(previousState);
                    
                    // Use setTimeout to ensure UI updates before releasing flag
                    setTimeout(() => {
                        hot.render(); // Force a render of the table
                        isUndoRedoAction = false;
                        
                        // Save the reverted state to server
                        saveChangesToServer(previousState);
                        
                        console.log("Undo performed. Table reverted to previous state");
                    }, 50);
                } catch (error) {
                    console.error("Error during undo operation:", error);
                    isUndoRedoAction = false;
                }
            } else {
                console.log("Nothing to undo");
            }
        });

        // Add redo functionality to the redo button
        document.getElementById('redo-btn').addEventListener('click', function(e) {
            // Prevent any default actions and stop propagation
            e.preventDefault();
            e.stopPropagation();
            
            console.log("Redo button clicked. Stack size:", redoStack.length);
            if (redoStack.length > 0) {
                try {
                    // Get current state to save to undo stack
                    const currentData = JSON.parse(JSON.stringify(hot.getData().map(row => {
                        const obj = {};
                        hot.getSettings().columns.forEach((col, index) => {
                            obj[col.data] = row[index];
                        });
                        return obj;
                    })));
                    
                    // Save current state to undo stack
                    undoStack.push(currentData);
                    
                    // Get next state from redo stack
                    const nextState = redoStack.pop();
                    
                    // Set flag to prevent recording this as a change
                    isUndoRedoAction = true;
                    
                    // Update the table with next state
                    hot.loadData(nextState);
                    
                    // Use setTimeout to ensure UI updates before releasing flag
                    setTimeout(() => {
                        hot.render(); // Force a render of the table
                        isUndoRedoAction = false;
                        
                        // Save the redone state to server
                        saveChangesToServer(nextState);
                        
                        console.log("Redo performed. Table updated to next state.");
                    }, 50);
                } catch (error) {
                    console.error("Error during redo operation:", error);
                    isUndoRedoAction = false;
                }
            } else {
                console.log("Nothing to redo");
            }
        });
        
        // Add event listener for cleanup when leaving the page
        window.addEventListener('beforeunload', function() {
            destroyHandsontable();
        });
    });
}

// Function to destroy Handsontable instance
function destroyHandsontable() {
    if (hot) {
        try {
            hot.destroy();
            hot = null;
        } catch (error) {
            console.error("Error destroying Handsontable:", error);
        }
    }
}

function saveChangesToServer(data) {
    if (!data) {
        console.error("No data to save");
        return;
    }
    
    try {
        // Make sure data is in the expected format (array of objects with column names)
        const columnNames = ["id", "date", "type", "amount", "site"];
        let formattedData;
        
        // Check if data is already in the correct format (array of objects)
        if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
            formattedData = data;
        } else {
            // Format array of arrays to array of objects
            formattedData = data.map(row => {
                const obj = {};
                columnNames.forEach((colName, index) => {
                    obj[colName] = row[index];
                });
                return obj;
            });
        }
        
        console.log("Formatted bank transaction data being sent to server");
        
        fetch('/update_all_bank_transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ transactions: formattedData })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(errorData.error || "Server error");
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                console.log("Data saved successfully!");
            } else {
                alert("Error saving data: " + (data.error || "Unknown error"));
            }
        })
        .catch(error => {
            console.error("Error saving data:", error);
            alert("Error saving data: " + error.message);
        });
    } catch (error) {
        console.error("Error in saveChangesToServer:", error);
        alert("Error preparing data: " + error.message);
    }
}

// Initialize Select2 dropdowns
function initializeSelect2() {
    $(document).ready(function() {
        // Initialize Select2 for all dropdowns with the class 'select2'
        $('.select2').select2({
            placeholder: "Select an option", // Optional: Add a placeholder
            selectOnClose: true,
            allowClear: true // Optional: Allow clearing the selection
        });
    
        // Automatically focus on the search box when the dropdown is opened
        $('.select2').on('select2:open', function (e) {
            // Find the search box inside the dropdown and focus it
            setTimeout(function() {
                const searchField = document.querySelector('.select2-container--open .select2-search__field');
                if (searchField) {
                    searchField.focus();
                }
            }, 50);
        });
    
        // On first focus (bubbles up to document), open the menu
        $(document).on('focus', '.select2-selection.select2-selection--single', function (e) {
            $(this).closest(".select2-container").siblings('select:enabled').select2('open');
        });
    
        // Steal focus during close - only capture once and stop propagation
        $('select.select2').on('select2:closing', function (e) {
            $(e.target).data("select2").$selection.one('focus focusin', function (e) {
                e.stopPropagation();
            });
        });
    });
}