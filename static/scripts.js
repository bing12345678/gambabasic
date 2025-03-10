window.onload = function() {
    // Get all the date cells in the table
    const dateCells = document.querySelectorAll('td:nth-child(2)'); // 2nd column for Date

    // Format each date in DD-MM-YYYY
    dateCells.forEach(cell => {
        const dateText = cell.textContent;
        if (dateText && dateText.includes('-')) {
            const parts = dateText.split('-');
            if (parts.length === 3) {
                // Reformat the date to DD-MM-YYYY
                const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                cell.textContent = formattedDate;
            }
        }
    });
};
