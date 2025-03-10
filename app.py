import csv
import os
import pandas as pd
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, make_response
from datetime import date

app = Flask(__name__)
app.secret_key = "test"

VALID_USERS = ["user1", "user2", "user3"]

# Path to the CSV files - consider using relative paths or environment variables
CSV_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(CSV_DIR, exist_ok=True)  # Create directory if it doesn't exist

bets_csv = os.path.join(CSV_DIR, 'bets.csv')
gamble_csv = os.path.join(CSV_DIR, 'gambling.csv')
websites_csv = os.path.join(CSV_DIR, 'websites.csv')
machines_csv = os.path.join(CSV_DIR, 'machines.csv')
bank_csv = os.path.join(CSV_DIR, 'bank.csv')

# Initialize CSV files if they don't exist
def initialize_csv_files():
    # Initialize gambling.csv
    if not os.path.exists(gamble_csv):
        pd.DataFrame(columns=[
            'id', 'date', 'website', 'machine', 'win', 'free_win', 
            'free_win_m', 'note', 'start_amount', 'end_amount', 'profit'
        ]).to_csv(gamble_csv, index=False)
    
    # Initialize bank.csv if it doesn't exist
    if not os.path.exists(bank_csv):
        pd.DataFrame(columns=['date', 'type', 'amount', 'site', 'user']).to_csv(bank_csv, index=False)
    
    # Initialize other CSVs if needed
    for file_path, header in [
        (websites_csv, ['website']),
        (machines_csv, ['machine']),
        (bets_csv, ['id', 'date', 'bet', 'odds', 'stake', 'win', 'website', 'note'])
    ]:
        if not os.path.exists(file_path):
            pd.DataFrame(columns=header).to_csv(file_path, index=False)

# Load gambles from the CSV file with optional user filtering
# Update the load_gambles function to ensure profit column exists
def load_gambles(user=None):
    try:
        if os.path.exists(gamble_csv):
            df = pd.read_csv(gamble_csv)
            
            # Ensure all required columns exist
            required_columns = ['id', 'date', 'website', 'machine', 'win', 
                               'free_win', 'free_win_m', 'note', 'start_amount', 
                               'end_amount', 'user', 'profit']
            for col in required_columns:
                if col not in df.columns:
                    df[col] = ''
            
            # Ensure numeric columns are numeric
            for col in ['id', 'win', 'free_win', 'start_amount', 'end_amount', 'profit']:
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
                except:
                    df[col] = 0
            
            # Ensure id is integer
            df['id'] = df['id'].astype(int)
            
            # Calculate profit as win + free_win
            df['profit'] = df['win'] + df['free_win']
            
            # Filter by user if specified
            if user:
                df = df[df['user'] == user]
            
            return df
        else:
            # Return empty DataFrame with required columns if file doesn't exist
            return pd.DataFrame(columns=[
                'id', 'date', 'website', 'machine', 'win', 'free_win', 
                'free_win_m', 'note', 'start_amount', 'end_amount', 'user', 'profit'
            ])
    except Exception as e:
        print(f"Error loading gambles: {str(e)}")
        return pd.DataFrame(columns=[
            'id', 'date', 'website', 'machine', 'win', 'free_win', 
            'free_win_m', 'note', 'start_amount', 'end_amount', 'user', 'profit'
        ])

# Save gambles to the CSV file with error handling
def save_gambles(df):
    try:
        df.to_csv(gamble_csv, index=False)
        return True
    except Exception as e:
        print(f"Error saving gambles: {str(e)}")
        return False

# Load items from simple CSV files (websites, machines)
def load_items_from_csv(file_path):
    try:
        if os.path.exists(file_path):
            with open(file_path, newline='') as f:
                return [row[0] for row in csv.reader(f) if row]
        return []
    except Exception as e:
        print(f"Error loading from {file_path}: {str(e)}")
        return []

# Add a new item to a simple CSV file
def add_item_to_csv(file_path, item):
    try:
        items = load_items_from_csv(file_path)
        if item not in items:
            items.append(item)
            with open(file_path, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerows([[item] for item in items])
        return True
    except Exception as e:
        print(f"Error adding item to {file_path}: {str(e)}")
        return False

# Format date from YYYY-MM-DD to DD-MM-YYYY for display
def format_date_for_display(date_str):
    try:
        if not date_str or pd.isna(date_str):
            return ''
        parts = date_str.split('-')
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
        return date_str
    except:
        return date_str

# Format date from DD-MM-YYYY to YYYY-MM-DD for storage
def format_date_for_storage(date_str):
    try:
        if not date_str or pd.isna(date_str):
            return ''
        parts = date_str.split('-')
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
        return date_str
    except:
        return date_str

# Main routes
@app.route('/index')
def index():
    return render_template('index.html')

@app.route('/betting')
def betting():
    return render_template('betting.html')

@app.route('/statistics')
def statistics():
    return render_template('statistics.html')

@app.route('/settings')
def settings():
    return render_template('settings.html')

@app.route('/gambling', methods=['GET', 'POST'])
def gambling():
    # Check if user is logged in
    if "user_code" not in session:
        return redirect(url_for("login"))

    # Get user code from session
    user_code = session["user_code"]
    
    # Initialize CSV files if they don't exist
    initialize_csv_files()
    
    # Load websites and machines
    websites = load_items_from_csv(websites_csv)
    machines = load_items_from_csv(machines_csv)
    
    # Load gambles for this user only
    gambles_df = load_gambles(user=user_code)
    
    if request.method == 'POST':
        # Extract form data
        form_id = request.form.get('id', '')
        form_date = request.form.get('date', '')
        form_website = request.form.get('website', '')
        form_machine = request.form.get('machine', '')
        form_win = request.form.get('win', '0')
        form_free_win = request.form.get('free_win', '0')
        form_free_win_m = request.form.get('free_win_m', 'None')
        form_note = request.form.get('note', '')
        form_start_amount = request.form.get('start_amount', '')
        form_end_amount = request.form.get('end_amount', '')
        
        # Add website to websites.csv if it's new
        if form_website and form_website not in websites:
            add_item_to_csv(websites_csv, form_website)
            websites.append(form_website)
            
        # Add machine to machines.csv if it's new and not empty
        if form_machine and form_machine not in machines and form_machine != '':
            add_item_to_csv(machines_csv, form_machine)
            machines.append(form_machine)
            
        # Convert numeric values with error handling
        try:
            form_win = float(form_win) if form_win else 0.0
            form_free_win = float(form_free_win) if form_free_win else 0.0
            form_start_amount = float(form_start_amount) if form_start_amount else None
            form_end_amount = float(form_end_amount) if form_end_amount else None
            
            # Calculate profit
            form_profit = form_win + form_free_win
        except ValueError:
            form_win = 0.0
            form_free_win = 0.0
            form_profit = 0.0
            form_start_amount = None
            form_end_amount = None
            
        # Create a new gamble entry
        new_gamble = {
            'date': form_date,
            'website': form_website,
            'machine': form_machine if form_machine else None,
            'win': form_win,
            'free_win': form_free_win,
            'free_win_m': form_free_win_m,
            'note': form_note,
            'start_amount': form_start_amount,
            'end_amount': form_end_amount,
            'profit': form_profit,
            'user': user_code
        }
        
        # Handle editing existing gamble or adding new one
        if form_id and form_id.isdigit() and int(form_id) in gambles_df['id'].values:
            # Editing existing gamble
            gamble_id = int(form_id)
            # Only allow editing if the gamble belongs to this user
            if gambles_df.loc[gambles_df['id'] == gamble_id, 'user'].iloc[0] == user_code:
                gambles_df.loc[gambles_df['id'] == gamble_id, new_gamble.keys()] = new_gamble.values()
        else:
            # Adding new gamble
            # Load all gambles to get the next ID (not just this user's gambles)
            all_gambles_df = load_gambles()
            next_id = all_gambles_df['id'].max() + 1 if not all_gambles_df.empty else 1
            new_gamble['id'] = next_id
            new_gamble_df = pd.DataFrame([new_gamble])
            # Get all gambles to append to
            all_gambles_df = pd.concat([all_gambles_df, new_gamble_df], ignore_index=True)
            # Save all gambles
            save_gambles(all_gambles_df)
            # Reload user's gambles
            gambles_df = load_gambles(user=user_code)
            
            return redirect(url_for('gambling'))
        
    # Format dates for display in table
    if not gambles_df.empty:
        gambles_df['date'] = gambles_df['date'].apply(format_date_for_display)
    
    # Convert DataFrame to list of dicts for template
    gambles_data = []
    if not gambles_df.empty:
        # Replace NaN values with empty strings for template
        gambles_df_clean = gambles_df.fillna('')
        gambles_data = gambles_df_clean.to_dict(orient='records')
        
    # Render the template
    return render_template(
        'gambling.html', 
        today=date.today().strftime('%Y-%m-%d'),
        websites=websites, 
        machines=machines, 
        gambles=gambles_data,
        user_code=user_code  # Pass the user code to the template
    )

# Get single gamble data for the modal
@app.route('/get_gamble_data', methods=['GET'])
def get_gamble_data():
    # Check if user is logged in
    if "user_code" not in session:
        return jsonify({"error": "You must be logged in"}), 401

    user_code = session["user_code"]
    gambles_df = load_gambles()  # Load all gambles
    gamble_id = request.args.get('id')
    
    try:
        gamble_id = int(gamble_id)
        gamble = gambles_df[gambles_df['id'] == gamble_id]
        
        if not gamble.empty:
            # Check if this gamble belongs to the logged-in user
            if gamble.iloc[0]['user'] != user_code:
                return jsonify({"error": "You don't have permission to view this gamble"}), 403
                
            # Convert to dict for JSON response
            gamble_dict = gamble.iloc[0].to_dict()
            # Handle NaN values
            for key, value in gamble_dict.items():
                if pd.isna(value):
                    gamble_dict[key] = None
            return jsonify(gamble_dict)
        else:
            return jsonify({"error": "Gamble not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400



# Get all gamble data
@app.route('/get_all_gambles', methods=['GET'])
def get_all_gambles():
    # Check if user is logged in
    if "user_code" not in session:
        return jsonify({"error": "You must be logged in"}), 401

    user_code = session["user_code"]
    
    try:
        # Load gambles from CSV for this user only
        gambles_df = load_gambles(user=user_code)
        
        # Convert DataFrame to list of dictionaries
        gambles_data = gambles_df.fillna('').to_dict(orient='records')
        
        # Return JSON response
        return jsonify(gambles_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500




# Update a single gamble
@app.route('/update_gamble', methods=['POST'])
def update_gamble():
    # Check if user is logged in
    if "user_code" not in session:
        return jsonify({"success": False, "error": "You must be logged in"}), 401

    user_code = session["user_code"]
    
    try:
        # Get JSON data from request
        data = request.get_json()
        print(f"Received data from frontend (update_gamble): {data}")
        
        if not data or 'gamble' not in data:
            return jsonify({"success": False, "error": "Invalid data format"}), 400
            
        gamble_data = data['gamble']
        
        # Extract and validate ID
        if 'id' not in gamble_data or not gamble_data['id']:
            print(f"Error: Missing gamble ID. Data received: {gamble_data}")
            return jsonify({"success": False, "error": "Missing gamble ID"}), 400

        try:
            gamble_id = int(gamble_data['id'])
        except ValueError:
            print(f"Error: Invalid gamble ID format. Data received: {gamble_data}")
            return jsonify({"success": False, "error": "Invalid gamble ID format"}), 400

        # Load all gambles
        gambles_df = load_gambles()

        # Check if gamble exists
        if gamble_id not in gambles_df['id'].values:
            print(f"Error: Gamble ID {gamble_id} not found in database.")
            return jsonify({"success": False, "error": f"Gamble ID {gamble_id} not found"}), 404
            
        # Check if gamble belongs to this user
        if gambles_df.loc[gambles_df['id'] == gamble_id, 'user'].iloc[0] != user_code:
            return jsonify({"success": False, "error": "You don't have permission to update this gamble"}), 403
            
        # Update gamble fields
        for field in gamble_data:
            if field not in ['id', 'profit']:  # Exclude profit
                # Handle numeric fields
                if field in ['win', 'free_win', 'start_amount', 'end_amount']:
                    try:
                        if gamble_data[field] in (None, ''):
                            gambles_df.loc[gambles_df['id'] == gamble_id, field] = 0 if field in ['win', 'free_win'] else None
                        else:
                            gambles_df.loc[gambles_df['id'] == gamble_id, field] = float(gamble_data[field])
                    except ValueError:
                        gambles_df.loc[gambles_df['id'] == gamble_id, field] = 0 if field in ['win', 'free_win'] else None
                else:
                    gambles_df.loc[gambles_df['id'] == gamble_id, field] = gamble_data[field]

        
        # Calculate profit after updating win and free_win
        idx = gambles_df['id'] == gamble_id
        win = gambles_df.loc[idx, 'win'].iloc[0] or 0
        free_win = gambles_df.loc[idx, 'free_win'].iloc[0] or 0
        gambles_df.loc[idx, 'profit'] = win + free_win
                    
        # Save updated gambles
        if save_gambles(gambles_df):
            return jsonify({"success": True, "message": f"Gamble {gamble_id} updated successfully"})
        else:
            return jsonify({"success": False, "error": "Failed to save gambles data"}), 500
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Update all gambles@app.route('/update_all_gambles', methods=['POST'])
@app.route('/update_all_gambles', methods=['POST'])
def update_all_gambles():
    # Check if user is logged in
    if "user_code" not in session:
        return jsonify({"success": False, "error": "You must be logged in"}), 401

    user_code = session["user_code"]
    
    try:
        # Get JSON data from request
        data = request.get_json()
        print(f"Received data from frontend (update_gamble): {data}")

        if not data or 'gambles' not in data:
            return jsonify({"success": False, "error": "Invalid data format"}), 400
            
        updated_gambles = data['gambles']
        
        # Check if it's a list of dictionaries
        if not all(isinstance(item, dict) for item in updated_gambles):
            return jsonify({"success": False, "error": "Invalid data format. Expected list of dictionaries."}), 400

        # Load all gambles
        all_gambles_df = load_gambles()
        
        # Get IDs of gambles that belong to this user
        user_gamble_ids = set(all_gambles_df[all_gambles_df['user'] == user_code]['id'].tolist())
        
        # Update each gamble if it belongs to this user
        for updated_gamble in updated_gambles:
            try:
                gamble_id = int(updated_gamble.get('id', 0))
                
                if gamble_id == 0 or gamble_id not in all_gambles_df['id'].values:
                    continue
                    
                # Skip if this gamble doesn't belong to the user
                if gamble_id not in user_gamble_ids:
                    continue
                    
                # Handle website, machine, etc.
                for field in ['date', 'website', 'machine', 'free_win_m', 'note']:
                    if field in updated_gamble:
                        all_gambles_df.loc[all_gambles_df['id'] == gamble_id, field] = updated_gamble[field]
                        
                # Handle numeric fields
                for field in ['win', 'free_win']:
                    if field in updated_gamble:
                        try:
                            value = updated_gamble[field]
                            all_gambles_df.loc[all_gambles_df['id'] == gamble_id, field] = float(value) if value not in (None, '') else 0
                        except:
                            all_gambles_df.loc[all_gambles_df['id'] == gamble_id, field] = 0
                
                # Calculate profit (win + free_win)
                idx = all_gambles_df['id'] == gamble_id
                win = all_gambles_df.loc[idx, 'win'].iloc[0] or 0
                free_win = all_gambles_df.loc[idx, 'free_win'].iloc[0] or 0
                all_gambles_df.loc[idx, 'profit'] = win + free_win
                
            except Exception as e:
                print(f"Error processing gamble {updated_gamble.get('id', 'unknown')}: {e}")
                continue
        
        # Save updated gambles
        if save_gambles(all_gambles_df):
            return jsonify({"success": True, "message": "All gambles updated successfully"})
        else:
            return jsonify({"success": False, "error": "Failed to save gambles data"}), 500
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500






@app.route('/delete_gamble/<int:gamble_id>', methods=['POST'])
def delete_gamble(gamble_id):
    # Check if user is logged in
    if "user_code" not in session:
        return jsonify({"success": False, "error": "You must be logged in"}), 401

    user_code = session["user_code"]
    
    try:
        gambles_df = load_gambles()
        
        if gamble_id in gambles_df['id'].values:
            # Check if this gamble belongs to the user
            if gambles_df.loc[gambles_df['id'] == gamble_id, 'user'].iloc[0] != user_code:
                return jsonify({"success": False, "error": "You don't have permission to delete this gamble"}), 403
                
            gambles_df = gambles_df[gambles_df['id'] != gamble_id]
            save_gambles(gambles_df)
            return jsonify({"success": True})
        else:
            return jsonify({"success": False, "error": f"Gamble {gamble_id} not found"}), 404
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500




@app.route('/bank', methods=['GET', 'POST'])
def bank():
    # Check if user is logged in
    if "user_code" not in session:
        return redirect(url_for("login"))

    user_code = session["user_code"]
    
    # Initialize CSV files if they don't exist
    initialize_csv_files()
    
    # Load bank transactions for this user
    bank_df = load_bank_transactions(user=user_code)
    
    # Calculate user balance
    balance_info = calculate_user_balance(user_code)
    
    if request.method == 'POST':
        # Extract form data
        form_date = request.form.get('date', '')
        form_type = request.form.get('type', '')
        form_amount = request.form.get('amount', '0')
        form_site = request.form.get('site', '')
        
        # Validate and convert amount
        try:
            form_amount = float(form_amount) if form_amount else 0.0
        except ValueError:
            form_amount = 0.0
        
        # Create a new transaction
        new_transaction = {
            'date': form_date,
            'type': form_type,
            'amount': form_amount,
            'site': form_site,
            'user': user_code
        }
        
        # Handle ID generation (max ID + 1)
        if not bank_df.empty:
            next_id = bank_df['id'].max() + 1
        else:
            next_id = 1  # If no transactions exist, start with 1
        
        new_transaction['id'] = next_id
        
        # Add transaction to DataFrame and save
        all_transactions_df = load_bank_transactions()
        new_transaction_df = pd.DataFrame([new_transaction])
        all_transactions_df = pd.concat([all_transactions_df, new_transaction_df], ignore_index=True)
        
        if save_bank_transactions(all_transactions_df):
            # Reload user's transactions and recalculate balance
            bank_df = load_bank_transactions(user=user_code)
            balance_info = calculate_user_balance(user_code)
            return redirect(url_for('bank'))
    
    # Format dates for display
    if not bank_df.empty:
        bank_df['date'] = bank_df['date'].apply(format_date_for_display)
    
    # Convert DataFrame to list of dicts for template
    transactions = []
    if not bank_df.empty:
        bank_df_clean = bank_df.fillna('')
        transactions = bank_df_clean.to_dict(orient='records')
    
    # Get sites from existing transactions and gambling entries
    gambling_df = load_gambles(user=user_code)
    sites = pd.unique(pd.concat([
        bank_df['site'].dropna(), 
        gambling_df['website'].dropna()
    ])).tolist()
    
    # Remove empty values
    sites = [site for site in sites if site]
    
    return render_template(
        'bank.html',
        today=date.today().strftime('%Y-%m-%d'),
        transactions=transactions,
        sites=sites,
        balance=balance_info,
        user_code=user_code
    )






# Function to load bank transactions from CSV
def load_bank_transactions(user=None):
    try:
        if os.path.exists(bank_csv):
            df = pd.read_csv(bank_csv)
            
            # Ensure all required columns exist
            required_columns = ['date', 'type', 'amount', 'site', 'user']
            for col in required_columns:
                if col not in df.columns:
                    df[col] = ''
            
            # Ensure numeric columns are numeric
            try:
                df['amount'] = pd.to_numeric(df['amount'], errors='coerce').fillna(0)
            except:
                df['amount'] = 0
            
            # Filter by user if specified
            if user:
                df = df[df['user'] == user]
            
            return df
        else:
            # Return empty DataFrame with required columns if file doesn't exist
            return pd.DataFrame(columns=['date', 'type', 'amount', 'site', 'user'])
    except Exception as e:
        print(f"Error loading bank transactions: {str(e)}")
        return pd.DataFrame(columns=['date', 'type', 'amount', 'site', 'user'])

# Save bank transactions to CSV
def save_bank_transactions(df):
    try:
        df.to_csv(bank_csv, index=False)
        return True
    except Exception as e:
        print(f"Error saving bank transactions: {str(e)}")
        return False

# Calculate overall balance for a user
def calculate_user_balance(user_code):
    try:
        # Load gambling data
        gambling_df = load_gambles(user=user_code)
        
        # Calculate total profit from gambling
        gambling_profit = gambling_df['profit'].sum()
        
        # Load bank transactions
        bank_df = load_bank_transactions(user=user_code)
        
        # Calculate balance from deposits/withdrawals
        # Deposits add to balance, withdrawals subtract
        bank_balance = 0
        for _, row in bank_df.iterrows():
            if row['type'].lower() == 'deposit':
                bank_balance += row['amount']
            elif row['type'].lower() == 'withdrawal':
                bank_balance -= row['amount']
        
        # Total balance is gambling profit + bank transactions
        total_balance = gambling_profit + bank_balance
        
        return {
            'gambling_profit': gambling_profit,
            'bank_balance': bank_balance,
            'total_balance': total_balance
        }
    except Exception as e:
        print(f"Error calculating balance: {str(e)}")
        return {
            'gambling_profit': 0,
            'bank_balance': 0,
            'total_balance': 0
        }


import pandas as pd

def calculate_user_balance_by_website(user_code):
    try:
        # Load gambling data
        gambling_df = load_gambles(user=user_code)
        
        # Group gambling data by website and calculate profit for each website
        gambling_profit_by_website = gambling_df.groupby('website')['profit'].sum().to_dict()
        
        # Load bank transactions
        bank_df = load_bank_transactions(user=user_code)
        
        # Group bank transactions by website and calculate balance for each website
        bank_balance_by_website = {}
        for website, group in bank_df.groupby('website'):
            balance = 0
            for _, row in group.iterrows():
                if row['type'].lower() == 'deposit':
                    balance += row['amount']
                elif row['type'].lower() == 'withdrawal':
                    balance -= row['amount']
            bank_balance_by_website[website] = balance
        
        # Calculate total balance for each website
        total_balance_by_website = {}
        for website in set(gambling_profit_by_website.keys()).union(bank_balance_by_website.keys()):
            total_balance_by_website[website] = (
                gambling_profit_by_website.get(website, 0) + bank_balance_by_website.get(website, 0)
            )
        
        return {
            'gambling_profit_by_website': gambling_profit_by_website,
            'bank_balance_by_website': bank_balance_by_website,
            'total_balance_by_website': total_balance_by_website
        }
    except Exception as e:
        print(f"Error calculating balance by website: {str(e)}")
        return {
            'gambling_profit_by_website': {},
            'bank_balance_by_website': {},
            'total_balance_by_website': {}
        }




@app.route('/get_all_bank_transactions', methods=['GET'])
def get_all_bank_transactions():
    # Check if user is logged in
    if "user_code" not in session:
        return jsonify({"error": "User not logged in"}), 401

    user_code = session["user_code"]
    
    try:
        # Load bank transactions for this user
        bank_df = load_bank_transactions(user=user_code)
        
        # If the dataframe is empty, return an empty array
        if bank_df.empty:
            return jsonify([])
        
        # Make sure there's an ID column
        if 'id' not in bank_df.columns:
            bank_df['id'] = bank_df.index + 1
        
        # Convert to dictionary format for JSON
        transactions_list = bank_df.to_dict(orient='records')
        
        return jsonify(transactions_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500




@app.route('/update_all_bank_transactions', methods=['POST'])
def update_all_bank_transactions():
    # Check if user is logged in
    if "user_code" not in session:
        return jsonify({"error": "User not logged in"}), 401

    user_code = session["user_code"]
    
    try:
        # Get data from request
        data = request.json
        
        if not data or 'transactions' not in data:
            return jsonify({"error": "Invalid data format"}), 400
        
        transactions = data['transactions']
        
        # Convert to DataFrame
        updated_df = pd.DataFrame(transactions)
        
        # Ensure 'user' column exists and set to current user
        updated_df['user'] = user_code
        
        # Load all existing transactions
        all_transactions_df = load_bank_transactions()
        
        # Remove this user's transactions from the existing data
        other_users_df = all_transactions_df[all_transactions_df['user'] != user_code]
        
        # Combine with the updated transactions
        combined_df = pd.concat([other_users_df, updated_df], ignore_index=True)
        
        # Save to CSV
        if save_bank_transactions(combined_df):
            # Update the balance information
            balance_info = calculate_user_balance(user_code)
            return jsonify({"success": True, "balance": balance_info})
        else:
            return jsonify({"error": "Failed to save transactions"}), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Delete a bank transaction
@app.route('/delete_bank_transaction/<transaction_id>', methods=['POST'])
def delete_bank_transaction(transaction_id):
    if "user_code" not in session:
        return jsonify({"error": "User not logged in"}), 401
        
    user_code = session["user_code"]
    
    try:
        # Load all transactions
        all_transactions_df = load_bank_transactions()
        
        # Convert transaction_id to int
        transaction_id = int(transaction_id)
        
        # Find the transaction with the given ID
        transaction_mask = (all_transactions_df['id'] == transaction_id) & (all_transactions_df['user'] == user_code)
        
        if not transaction_mask.any():
            return jsonify({"error": "Transaction not found"}), 404
            
        # Remove the transaction
        all_transactions_df = all_transactions_df[~transaction_mask]
        
        # Save the updated dataframe
        if save_bank_transactions(all_transactions_df):
            # Recalculate balance
            balance_info = calculate_user_balance(user_code)
            return jsonify({"success": True, "balance": balance_info})
        else:
            return jsonify({"error": "Failed to delete transaction"}), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500




@app.route("/", methods=["GET", "POST"])
def login():
    # Check if user is already logged in via session or cookie
    if "user_code" in session:
        return redirect(url_for("index"))
    
    user_code = request.cookies.get("user_code")  # Check if stored in cookie
    if user_code in VALID_USERS:
        session["user_code"] = user_code  # Restore session from cookie
        return redirect(url_for("index"))

    if request.method == "POST":
        user_code = request.form.get("user_code")
        if user_code in VALID_USERS:
            session["user_code"] = user_code  # Store in session
            response = make_response(redirect(url_for("index")))
            response.set_cookie("user_code", user_code, max_age=30*24*60*60)  # Store in cookie for 30 days
            return response
        else:
            return "Invalid code. Try again.", 401

    return render_template("login.html")

@app.route("/dashboard")
def dashboard():
    if "user_code" not in session:
        return redirect(url_for("login"))

    user_code = session["user_code"]
    
    # Load gambles for this user only
    gambles_df = load_gambles(user=user_code)
    
    # Filter the data to only show the logged-in user's entries
    user_gambles_list = gambles_df.fillna('').to_dict(orient='records')

    return render_template("dashboard.html", gambles=user_gambles_list, user_code=user_code)

@app.route("/logout")
def logout():
    session.clear()
    response = make_response(redirect(url_for("login")))
    response.set_cookie("user_code", "", expires=0)  # Remove cookie
    return response


if __name__ == '__main__':
    # Ensure CSV files exist
    initialize_csv_files()
    app.run(debug=True)

