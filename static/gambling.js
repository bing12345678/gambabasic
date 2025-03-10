
// add settings, where you can add websites / machines to the .csv, working like the gambling page
// Add bank, where you can modify gambling site balances
// background
// statistics
// auto insert starting amount, after statistics page and bank pages has been added



document.addEventListener("DOMContentLoaded", function() {
    console.log("Gambling tracker initialized");
    
    // Initialize Select2 components
    initializeSelect2();
    
    // Set up the form calculation logic
    setupFormCalculations();

    

    
    // Set up modal for amount editing
    setupAmountEditModal();

    setupDeleteButtons();

    
    // Initialize Handsontable
    initializeHandsontable(); 

});

// Global variables to store the current state and change history
let undoStack = [];
let redoStack = [];
let currentState = [];  // Current state of the table data


// Function to fetch all gamble data
function fetchAllGambleDetails() {
    return fetch(`/get_all_gambles`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error fetching all gamble data: ' + data.error);
                return null;
            }
            return data;  // Return the fetched data
        })
        .catch(error => {
            console.error("Error fetching all gamble data:", error);
            alert('Error fetching all gamble data');
            return null;
        });
}

// Function to fetch data and initialize Handsontable with filters
function initializeHandsontable() {
    fetchAllGambleDetails().then(gamblesData => {
        if (!gamblesData) return; // Exit if fetching fails

        var container = document.getElementById('gamble-table');
        
        let undoStack = [];   // Stack to store previous states for undo
        let redoStack = [];   // Stack to store undone states for redo
        let isUndoRedoAction = false; // Flag to prevent recording undo/redo as changes
        
        // Clone initial data for state tracking
        let initialState = JSON.parse(JSON.stringify(gamblesData));
        
        const hot = new Handsontable(container, {
            licenseKey: 'non-commercial-and-evaluation',
            data: gamblesData,
            columns: [
                { data: 'id', type: 'numeric' },
                { data: 'date', type: 'date', dateFormat: 'YYYY-MM-DD' },
                { data: 'website', type: 'text' },
                { data: 'machine', type: 'text' },
                { data: 'win', type: 'numeric' },
                { data: 'free_win_m', type: 'text' },
                { data: 'free_win', type: 'numeric' },
                { data: 'profit', type: 'numeric' }, 
                { data: 'note', type: 'text', wordWrap: false },
                { 
                    data: null, // No associated data field
                    renderer: deleteButtonRenderer // Custom delete button renderer
                }
            ],
            colWidths: [30, null, null, 60, 40, 60, 40, 40, 30, 17],  // Only 'Win' column has a fixed width
            colHeaders: ["ID", "Date", "Website", "Machine", "Win", "Free Win Machine", "Free Win", "Profit", "Note", ""],
            rowHeaders: true,
            columnSorting: true,
            filters: true,
            manualColumnResize: true,
            manualRowResize: true,
            autoColumnSize: false,
            dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
            editable: true,
            columnSorting: {
                initialConfig: {
                    column: 1, // The index of the "Date" column (0-based index)
                    sortOrder: 'desc' // Sort in descending order (newest dates first)
                }
            },
            stretchH: 'all', // Stretch columns to fill width
            
            beforeChange: function(changes, source) {
                if (source === 'edit' && !isUndoRedoAction) {
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
                    
                    console.log("State saved to undo stack:", currentData);
                }
            },
            afterChange: function(changes, source) {
                if (source === 'edit' && !isUndoRedoAction) {
                    // Save changes to server after edit
                    saveChangesToServer(hot.getData());
                }
            }
        });


        
        // Custom renderer for delete button
        function deleteButtonRenderer(instance, td, row, col, prop, value, cellProperties) {
            td.innerHTML = '<button class="delete-btn">🗑️</button>';
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

            const gambleId = rowData.id; // Get gamble ID
            if (!gambleId) return;

            // Confirm deletion
            if (!confirm("Are you sure you want to delete this row?")) return;

            // Send delete request to the server with the correct gamble ID
            fetch(`/delete_gamble/${gambleId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log("Row deleted successfully!");
                    // Refresh the entire table instead of just removing the row
                    fetchAllGambleDetails().then(updatedData => {
                        hot.loadData(updatedData);
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
        document.getElementById('undo-btn').addEventListener('click', function() {
            console.log("Undo stack before undo:", JSON.stringify(undoStack));
            if (undoStack.length > 0) {
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
                hot.render(); // Force a render of the table
                
                // Reset flag
                isUndoRedoAction = false;
                
                // Save the reverted state to server
                saveChangesToServer(previousState);
                
                console.log("Undo performed. Table reverted to previous state:", previousState);
            } else {
                console.log("Nothing to undo");
            }
        });

        // Add redo functionality to the redo button
        document.getElementById('redo-btn').addEventListener('click', function() {
            if (redoStack.length > 0) {
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
                
                // Reset flag
                isUndoRedoAction = false;
                
                // Save the redone state to server
                saveChangesToServer(nextState);
                
                console.log("Redo performed. Table updated to next state.");
            } else {
                console.log("Nothing to redo");
            }
        });
    });
}

function saveChangesToServer(data) {
    // Make sure data is in the expected format (array of objects with column names)
    const columnNames = ["id", "date", "website", "machine", "win", "free_win_m", "free_win", "profit", "note"];
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
    
    console.log("Formatted data being sent to server:", formattedData);
    
    fetch('/update_all_gambles', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gambles: formattedData })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errorData => {
                alert("Error saving data: " + errorData.error);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log("Data saved successfully!");
        } else {
            alert("Error saving data: " + data.error);
        }
    })
    .catch(error => {
        alert("Error: " + error.message);
    });
}
//             minimumInputLength: 1, // Minimum number of characters to start searching

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
            document.querySelector('.select2-container--open .select2-search__field').focus();
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
// Set up calculations for the form fields
function setupFormCalculations() {
    const startAmountInput = document.getElementById('start_amount');
    const endAmountInput = document.getElementById('end_amount');
    const winInput = document.getElementById('win');

    // Calculate win amount when start or end amount changes
    const calculateWin = function() {
        const startAmount = parseFloat(startAmountInput.value) || 0;
        const endAmount = parseFloat(endAmountInput.value) || 0;

        // Only calculate the win if the end amount has been inputted
        if (endAmount !== 0) {
            winInput.value = (endAmount - startAmount).toFixed(2);
        } else {
            winInput.value = '';  // Clear the win input if no end amount
        }
    };

    startAmountInput.addEventListener('input', calculateWin);
    endAmountInput.addEventListener('input', calculateWin);
}






// Updated setupAmountEditModal to work with the win column
function setupAmountEditModal() {
    const modal = document.getElementById("edit-amount-modal");
    const closeBtn = document.querySelector(".close-btn");
    const form = document.getElementById("edit-amount-form");
    let currentRow;
    let isFreeWin = false; // Flag to determine if editing free_win column
    
    document.getElementById('gamble-table').addEventListener('contextmenu', function(event) {
        event.preventDefault(); // Prevent the default context menu
        
        const cell = event.target.closest("td");
        if (cell) {
            // Check if the click is on the 'win' column (index 5) or 'free_win' column (index 7)
            if (cell.cellIndex === 5 || cell.cellIndex === 7) {
                currentRow = cell.closest("tr");
                const gambleId = currentRow.cells[1].innerText; // Get the value from index 1 column (second column)
                
                if (!gambleId) {
                    alert('Error: Could not identify the gamble.');
                    return;
                }
                
                // Determine if editing free_win column
                isFreeWin = cell.cellIndex === 7;
                
                // Fetch gamble details
                fetch(`/get_gamble_data?id=${gambleId}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data && !data.error) {
                            // Set values based on whether editing win or free_win
                            if (isFreeWin) {
                                document.getElementById("start_amount_edit").value = data.f_start_amount || '';
                                document.getElementById("end_amount_edit").value = data.f_end_amount || '';
                            } else {
                                document.getElementById("start_amount_edit").value = data.start_amount || '';
                                document.getElementById("end_amount_edit").value = data.end_amount || '';
                            }
                            
                            // Open the modal
                            modal.style.display = "block";
                        } else {
                            alert('Error fetching gamble data: ' + (data.error || 'Unknown error'));
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching gamble data:', error);
                        alert('Error fetching gamble data');
                    });
            }
        }
    });
    
    // Close the modal with the X button
    closeBtn.addEventListener('click', function() {
        modal.style.display = "none";
    });
    
    // Close the modal when clicking outside the modal content
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });
    
    // Handle form submission
    form.addEventListener('submit', function(event) {
        event.preventDefault();
        
        const startAmount = document.getElementById("start_amount_edit").value;
        const endAmount = document.getElementById("end_amount_edit").value;
        modal.style.display = "none";
        
        if (!currentRow) {
            alert("Error: Could not identify the row to update.");
            return;
        }
        
        // Get gambleId from the cell directly, instead of data-id attribute
        const gambleId = currentRow.cells[1].innerText; 
        
        // Calculate the win or free_win amount
        const amount = parseFloat(endAmount) - parseFloat(startAmount);
        
        // Update the table based on whether editing win or free_win
        if (isFreeWin) {
            currentRow.querySelector('td:nth-child(8)').innerText = amount.toFixed(2); // Update free_win column (index 7)
        } else {
            currentRow.querySelector('td:nth-child(6)').innerText = amount.toFixed(2); // Update win column (index 5)
        }
        
        // Send the updated data to the server
        const updatedGambleData = {
            id: gambleId,
            start_amount: isFreeWin ? undefined : startAmount, // Only send start_amount for win
            end_amount: isFreeWin ? undefined : endAmount, // Only send end_amount for win
            win: isFreeWin ? undefined : amount.toFixed(2), // Only send win for win column
            f_start_amount: isFreeWin ? startAmount : undefined, // Only send f_start_amount for free_win
            f_end_amount: isFreeWin ? endAmount : undefined, // Only send f_end_amount for free_win
            free_win: isFreeWin ? amount.toFixed(2) : undefined // Only send free_win for free_win column
        };
        
        fetch('/update_gamble', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gamble: updatedGambleData })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log("Successfully updated amounts");
            } else {
                alert('Error updating amounts: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error("Error updating amounts:", error);
            alert("Error updating amounts. Please try again.");
        });
    });
}




function setupDeleteButtons() {
    const deleteButtons = document.querySelectorAll('.delete-btn');
    
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(event) {
            const row = event.target.closest('tr');
            const gambleId = row.getAttribute('data-id');
            
            // Confirm delete action
            const confirmDelete = confirm(`Are you sure you want to delete Gamble ID: ${gambleId}?`);
            if (!confirmDelete) {
                return;
            }
            
            // Send DELETE request to server
            fetch(`/delete_gamble/${gambleId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Successfully deleted, remove the row from the table
                    row.remove();
                } else {
                    alert(data.error || "Error deleting gamble");
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error deleting gamble. Please try again.');
            });
        });
    });
}