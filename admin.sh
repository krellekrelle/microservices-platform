#!/bin/bash

# Microservices Platform - Database Admin Tools
# Simple command-line interface for user management

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to execute database commands
db_exec() {
    docker compose exec -T database psql -U app_user -d microservices_platform -c "$1" 2>/dev/null
}

# Function to check if services are running
check_services() {
    if ! docker compose ps database | grep -q "Up"; then
        echo -e "${RED}❌ Database service is not running. Please start with: docker compose up -d${NC}"
        exit 1
    fi
}

# Function to list all users
list_users() {
    echo -e "${BLUE}📋 All Users:${NC}"
    echo "----------------------------------------"
    db_exec "SELECT id, email, name, status, is_admin, created_at FROM users ORDER BY created_at DESC;" | head -n -2 | tail -n +3
    echo ""
}

# Function to list users by status
list_by_status() {
    local status=$1
    local display_name=""
    
    case $status in
        "unknown") display_name="🟡 Pending Approval" ;;
        "approved") display_name="🟢 Approved Users" ;;
        "rejected") display_name="🔴 Rejected Users" ;;
        *) echo -e "${RED}Invalid status: $status${NC}"; return 1 ;;
    esac
    
    echo -e "${BLUE}$display_name:${NC}"
    echo "----------------------------------------"
    local result=$(db_exec "SELECT email, name, created_at FROM users WHERE status = '$status' ORDER BY created_at DESC;")
    
    # Skip header lines and footer
    local data_lines=$(echo "$result" | sed '1,2d' | head -n -1)
    
    if [[ -z "$data_lines" ]]; then
        echo "No users found with status: $status"
    else
        echo "$data_lines"
    fi
    echo ""
}

# Function to approve a user
approve_user() {
    local email=$1
    if [[ -z "$email" ]]; then
        echo -e "${RED}❌ Please provide an email address${NC}"
        return 1
    fi
    
    local result=$(db_exec "UPDATE users SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE email = '$email' RETURNING email, name;")
    if [[ $(echo "$result" | wc -l) -eq 3 ]]; then
        echo -e "${RED}❌ User not found: $email${NC}"
    else
        echo -e "${GREEN}✅ User approved: $email${NC}"
        # Log the change
        db_exec "INSERT INTO user_status_changes (user_id, old_status, new_status, reason) SELECT id, 'unknown', 'approved', 'Approved via admin script' FROM users WHERE email = '$email';" > /dev/null
    fi
}

# Function to reject a user
reject_user() {
    local email=$1
    if [[ -z "$email" ]]; then
        echo -e "${RED}❌ Please provide an email address${NC}"
        return 1
    fi
    
    local result=$(db_exec "UPDATE users SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE email = '$email' RETURNING email, name;")
    if [[ $(echo "$result" | wc -l) -eq 3 ]]; then
        echo -e "${RED}❌ User not found: $email${NC}"
    else
        echo -e "${YELLOW}⚠️ User rejected: $email${NC}"
        # Log the change
        db_exec "INSERT INTO user_status_changes (user_id, old_status, new_status, reason) SELECT id, 'approved', 'rejected', 'Rejected via admin script' FROM users WHERE email = '$email';" > /dev/null
    fi
}

# Function to show user history
user_history() {
    local email=$1
    if [[ -z "$email" ]]; then
        echo -e "${RED}❌ Please provide an email address${NC}"
        return 1
    fi
    
    echo -e "${BLUE}📊 Status History for: $email${NC}"
    echo "----------------------------------------"
    db_exec "SELECT usc.old_status, usc.new_status, usc.changed_at, usc.reason FROM user_status_changes usc JOIN users u ON usc.user_id = u.id WHERE u.email = '$email' ORDER BY usc.changed_at DESC;" | head -n -2 | tail -n +3
    echo ""
}

# Function to show database stats
db_stats() {
    echo -e "${BLUE}📊 Database Statistics:${NC}"
    echo "----------------------------------------"
    
    local total=$(db_exec "SELECT COUNT(*) FROM users;" | head -n -2 | tail -n +3 | xargs)
    local approved=$(db_exec "SELECT COUNT(*) FROM users WHERE status = 'approved';" | head -n -2 | tail -n +3 | xargs)
    local pending=$(db_exec "SELECT COUNT(*) FROM users WHERE status = 'unknown';" | head -n -2 | tail -n +3 | xargs)
    local rejected=$(db_exec "SELECT COUNT(*) FROM users WHERE status = 'rejected';" | head -n -2 | tail -n +3 | xargs)
    local admins=$(db_exec "SELECT COUNT(*) FROM users WHERE is_admin = true;" | head -n -2 | tail -n +3 | xargs)
    
    echo "Total Users: $total"
    echo "🟢 Approved: $approved"
    echo "🟡 Pending: $pending" 
    echo "🔴 Rejected: $rejected"
    echo "👑 Admins: $admins"
    echo ""
}

# Function to show help
show_help() {
    echo -e "${GREEN}🛠️ Microservices Platform - Database Admin Tools${NC}"
    echo ""
    echo "Usage: $0 [command] [arguments]"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  list                    - List all users"
    echo "  pending                 - List pending users"
    echo "  approved                - List approved users"
    echo "  rejected                - List rejected users"
    echo "  approve <email>         - Approve a user"
    echo "  reject <email>          - Reject a user"
    echo "  history <email>         - Show user status history"
    echo "  stats                   - Show database statistics"
    echo "  help                    - Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 pending"
    echo "  $0 approve user@example.com"
    echo "  $0 reject spam@example.com"
    echo "  $0 history user@example.com"
    echo ""
}

# Main script logic
main() {
    check_services
    
    case ${1:-""} in
        "list"|"users")
            list_users
            ;;
        "pending"|"unknown")
            list_by_status "unknown"
            ;;
        "approved")
            list_by_status "approved"
            ;;
        "rejected")
            list_by_status "rejected"
            ;;
        "approve")
            approve_user "$2"
            ;;
        "reject")
            reject_user "$2"
            ;;
        "history")
            user_history "$2"
            ;;
        "stats"|"statistics")
            db_stats
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            echo -e "${RED}❌ Unknown command: $1${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run the main function with all arguments
main "$@"
