'use client'

import { useState, useEffect } from 'react'
import { Plus, Check, ChevronDown, ChevronRight, Trash2, ShoppingCart, Home, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

/**
 * ShoppingList Component
 * 
 * This is the main shopping list application that allows users to:
 * - Create and manage shopping items organized by categories
 * - Toggle between "Plan Mode" (adding/organizing items) and "Store Mode" (checking off items while shopping)
 * - Add custom categories beyond the default ones
 * - Real-time sync across devices using Supabase
 * 
 * MULTI-USER SUPPORT:
 * Currently, each user has their own separate shopping list (filtered by user_id).
 * Multiple users CANNOT share the same list - each authenticated user sees only their own items.
 * To enable sharing, you would need to implement a "shared lists" feature with permissions.
 */
export default function ShoppingList({ session }) {
  // ============ STATE MANAGEMENT ============
  
  // Core data arrays
  const [items, setItems] = useState([])        // All shopping items for this user
  const [categories, setCategories] = useState([])  // All available categories (default + custom)
  
  // UI state for adding new items to each category
  const [newItemInputs, setNewItemInputs] = useState({})  // Object: {categoryName: inputValue}
  
  // UI state for category collapsing/expanding
  const [collapsedCategories, setCollapsedCategories] = useState(new Set())  // Set of collapsed category names
  
  // Main mode toggle: Plan Mode (organizing) vs Store Mode (shopping)
  const [storeMode, setStoreMode] = useState(false)
  
  // UI state for adding new categories
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  
  // Loading state for initial data fetch
  const [loading, setLoading] = useState(true)

  // ============ DEFAULT CATEGORIES ============
  // These categories are always available to all users
  const defaultCategories = [
    'Refrigerated items', 'Bread', 'Fruit/Veggie', 'Frozen', 'Bulk', 'Household items'
  ]

  // ============ DATABASE OPERATIONS ============

  /**
   * Fetch all shopping items for the current user from Supabase
   * Items are filtered by user_id to ensure users only see their own items
   */
  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_items')           // Table name
        .select('*')                      // Get all columns
        .eq('user_id', session.user.id)   // Filter: only this user's items
        .order('created_at', { ascending: true })  // Sort by creation time

      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error('Error fetching items:', error)
    }
  }

  /**
   * Fetch custom categories created by the current user
   * Combines with default categories to create the full category list
   */
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')               // Table name for custom categories
        .select('*')                      // Get all columns
        .eq('user_id', session.user.id)   // Filter: only this user's categories
        .order('created_at', { ascending: true })

      if (error) throw error
      
      // Extract just the category names from the database results
      const userCategories = data?.map(cat => cat.name) || []
      
      // Combine default categories with user's custom categories (avoiding duplicates)
      const allCategories = [...defaultCategories, ...userCategories.filter(cat => !defaultCategories.includes(cat))]
      setCategories(allCategories)
    } catch (error) {
      console.error('Error fetching categories:', error)
      // Fallback to just default categories if database fails
      setCategories(defaultCategories)
    }
  }

  // ============ COMPONENT INITIALIZATION ============

  /**
   * Load initial data when component mounts or user changes
   * This runs once when the component first loads
   */
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true)
      // Load both items and categories in parallel for better performance
      await Promise.all([fetchItems(), fetchCategories()])
      setLoading(false)
    }

    // Only initialize if we have a valid user session
    if (session?.user?.id) {
      initializeData()
    }
  }, [session?.user?.id])  // Re-run if user changes

  // ============ REAL-TIME SUBSCRIPTIONS ============

  /**
   * Set up real-time listeners for database changes
   * This ensures the UI updates immediately when data changes in the database
   * (useful for multi-device sync or if data changes elsewhere)
   */
  useEffect(() => {
    if (!session?.user?.id) return

    // Listen for changes to shopping_items table
    const itemsSubscription = supabase
      .channel('shopping_items_changes')    // Unique channel name
      .on('postgres_changes', 
        { 
          event: '*',                       // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',                 // Database schema
          table: 'shopping_items',          // Table to watch
          filter: `user_id=eq.${session.user.id}`  // Only changes for this user
        },
        () => {
          // When any change occurs, refresh the items list
          fetchItems()
        }
      )
      .subscribe()

    // Listen for changes to categories table
    const categoriesSubscription = supabase
      .channel('categories_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'categories',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          // When any change occurs, refresh the categories list
          fetchCategories()
        }
      )
      .subscribe()

    // Cleanup: unsubscribe when component unmounts or user changes
    return () => {
      itemsSubscription.unsubscribe()
      categoriesSubscription.unsubscribe()
    }
  }, [session?.user?.id])

  // ============ CATEGORY MANAGEMENT ============

  /**
   * Add a new custom category to the database
   * The category will be available for this user only
   */
  const addCategory = async () => {
    // Validation: must have text and not already exist
    if (!newCategoryName.trim() || categories.includes(newCategoryName.trim())) return

    try {
      const { error } = await supabase
        .from('categories')
        .insert([{
          name: newCategoryName.trim(),
          user_id: session.user.id        // Associate with current user
        }])

      if (error) throw error

      // Reset form and refresh data
      setNewCategoryName('')
      setShowAddCategory(false)
      await fetchCategories()
    } catch (error) {
      console.error('Error adding category:', error)
    }
  }

  // ============ ITEM MANAGEMENT ============

  /**
   * Add a new item to a specific category
   * New items start as not needed and not bought
   */
  const addItem = async (category) => {
    const inputValue = newItemInputs[category] || ''
    if (!inputValue.trim()) return  // Don't add empty items

    try {
      const { error } = await supabase
        .from('shopping_items')
        .insert([{
          name: inputValue.trim(),
          category: category,
          needed: false,      // New items start as "not needed"
          bought: false,      // New items start as "not bought"
          user_id: session.user.id  // Associate with current user
        }])

      if (error) throw error

      // Clear the input field for this category and refresh data
      setNewItemInputs({ ...newItemInputs, [category]: '' })
      await fetchItems()
    } catch (error) {
      console.error('Error adding item:', error)
    }
  }

  /**
   * Update the input value for adding new items to a specific category
   * This is controlled input state management
   */
  const updateNewItemInput = (category, value) => {
    setNewItemInputs({ ...newItemInputs, [category]: value })
  }

  /**
   * Toggle whether an item is "needed" for the next shopping trip
   * Used in Plan Mode - mark items you need to buy
   */
  const toggleNeeded = async (id) => {
    const item = items.find(item => item.id === id)
    if (!item) return

    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ needed: !item.needed })  // Flip the needed status
        .eq('id', id)                      // Which item to update
        .eq('user_id', session.user.id)    // Security: only update user's own items

      if (error) throw error
      await fetchItems()  // Refresh to show the change
    } catch (error) {
      console.error('Error updating item:', error)
    }
  }

  /**
   * Toggle whether an item has been "bought" during shopping
   * Used in Store Mode - check off items as you put them in your cart
   */
  const toggleBought = async (id) => {
    const item = items.find(item => item.id === id)
    if (!item) return

    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ bought: !item.bought })  // Flip the bought status
        .eq('id', id)
        .eq('user_id', session.user.id)

      if (error) throw error
      await fetchItems()
    } catch (error) {
      console.error('Error updating item:', error)
    }
  }

  /**
   * Permanently delete an item from the database
   * Only available in Plan Mode to prevent accidental deletion while shopping
   */
  const deleteItem = async (id) => {
    try {
      const { error } = await supabase
        .from('shopping_items')
        .delete()                        // Delete operation
        .eq('id', id)
        .eq('user_id', session.user.id)  // Security: only delete user's own items

      if (error) throw error
      await fetchItems()
    } catch (error) {
      console.error('Error deleting item:', error)
    }
  }

  /**
   * Reset all items after a shopping trip
   * Sets all items to needed=false and bought=false, then returns to Plan Mode
   */
  const resetShopping = async () => {
    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ needed: false, bought: false })  // Reset all flags
        .eq('user_id', session.user.id)            // For all user's items

      if (error) throw error

      setStoreMode(false)  // Return to Plan Mode
      await fetchItems()
    } catch (error) {
      console.error('Error resetting shopping:', error)
    }
  }

  // ============ AUTHENTICATION ============

  /**
   * Sign out the current user
   * This will redirect them back to the login screen
   */
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  // ============ UI STATE MANAGEMENT ============

  /**
   * Toggle a category between collapsed and expanded
   * Collapsed categories show only the header, expanded show all items
   */
  const toggleCategory = (category) => {
    const newCollapsed = new Set(collapsedCategories)
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category)  // Expand it
    } else {
      newCollapsed.add(category)     // Collapse it
    }
    setCollapsedCategories(newCollapsed)
  }

  // ============ DATA FILTERING AND SORTING ============

  /**
   * Get all items for a specific category, filtered by current mode
   * In Store Mode: only show items that are marked as "needed"
   * In Plan Mode: show all items in the category
   * Items are always sorted alphabetically for consistent ordering
   */
  const getItemsByCategory = (category) => {
    let filteredItems
    if (storeMode) {
      // Store Mode: only show items marked as needed (your shopping list for today)
      filteredItems = items.filter(item => item.category === category && item.needed)
    } else {
      // Plan Mode: show all items in this category
      filteredItems = items.filter(item => item.category === category)
    }
    
    // Sort items alphabetically by name (case-insensitive)
    // This ensures consistent ordering regardless of when items were added
    return filteredItems.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  }

  /**
   * Calculate completion statistics for a category
   * Returns different stats depending on current mode
   */
  const getCategoryStats = (category) => {
    const categoryItems = getItemsByCategory(category)
    if (storeMode) {
      // Store Mode: how many items have been bought vs total needed
      const bought = categoryItems.filter(item => item.bought).length
      const total = categoryItems.length
      return { completed: bought, total }
    } else {
      // Plan Mode: how many items are marked as needed vs total items
      const needed = categoryItems.filter(item => item.needed).length
      const total = categoryItems.length
      return { completed: needed, total }
    }
  }

  /**
   * Count items still needed (marked as needed but not yet bought)
   * Used for the summary display
   */
  const getNeededItemsCount = () => {
    return items.filter(item => item.needed && !item.bought).length
  }

  /**
   * Count items already bought during current shopping trip
   * Used for the summary display in Store Mode
   */
  const getBoughtItemsCount = () => {
    return items.filter(item => item.needed && item.bought).length
  }

  // ============ CATEGORY VISIBILITY ============

  /**
   * Determine which categories should be shown
   * In Store Mode: only show categories that have items marked as needed
   * In Plan Mode: show all categories (so you can add items to empty ones)
   */
  const visibleCategories = categories.filter(category => {
    const categoryItems = getItemsByCategory(category)
    return categoryItems.length > 0 || !storeMode
  })

  // ============ LOADING STATE ============

  /**
   * Show loading screen while initial data is being fetched
   */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading your shopping list...</div>
      </div>
    )
  }

  // ============ MAIN RENDER ============

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* ============ MAIN CONTAINER ============ */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          
          {/* ============ HEADER SECTION ============ */}
          <div className="flex items-center justify-between mb-6">
            {/* App title and user info */}
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                🛒 Shopping List
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome, {session.user.email}
              </p>
            </div>
            
            {/* Control buttons - responsive design with flex-wrap for mobile */}
            <div className="flex items-center gap-1.5 flex-wrap">
              
              {/* Sign out button - hides text on small screens to save space */}
              <button
                onClick={signOut}
                className="px-2 py-1.5 text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-1 text-xs"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
              
              {/* Mode Toggle Button - switches between Plan and Store modes */}
              <button
                onClick={() => setStoreMode(!storeMode)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all duration-200 text-xs ${
                  storeMode 
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'    // Green when in Store Mode
                    : 'bg-green-600 text-white hover:bg-green-700'   // Gray when in Plan Mode
                }`}
              >
                {storeMode ? <Home size={16} /> : <ShoppingCart size={16} />}
                <span className="hidden xs:inline">{storeMode ? 'Store' : 'Plan'}</span>
              </button>
            </div>
          </div>

          {/* ============ SUMMARY STATS BAR ============ */}
          <div className="bg-gray-50 rounded-lg p-2 mb-3">
            {storeMode ? (
              // Store Mode: Show shopping progress and Reset button
              <div className="flex justify-between items-center">
                <div className="flex gap-6 text-sm">
                  <span className="text-green-600 font-medium">
                    ✓ {getBoughtItemsCount()} bought
                  </span>
                  <span className="text-blue-600 font-medium">
                    🛒 {getNeededItemsCount()} remaining
                  </span>
                </div>
                <button
                  onClick={resetShopping}
                  className="px-2.5 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs font-medium"
                >
                  Reset
                </button>
              </div>
            ) : (
              // Plan Mode: Show items needed and Add Category button
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  <span className="font-medium text-blue-600">{getNeededItemsCount()}</span> items needed for next trip
                </div>
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="px-2.5 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-xs font-medium flex items-center gap-1"
                >
                  <Plus size={12} />
                  Add Category
                </button>
              </div>
            )}
          </div>

          {/* ============ ADD CATEGORY FORM ============ */}
          {/* Only shown when user clicks "Add Category" and in Plan Mode */}
          {showAddCategory && !storeMode && (
            <div className="bg-purple-50 rounded-xl p-3 mb-4 border-2 border-dashed border-purple-200">
              <h3 className="text-base font-medium text-gray-700 mb-2">Add New Category</h3>
              <div className="flex gap-3">
                {/* Text input for new category name */}
                <input
                  type="text"
                  placeholder="Enter category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  onKeyPress={(e) => e.key === 'Enter' && addCategory()}  // Allow Enter key to submit
                  autoFocus  // Focus this input when form appears
                />
                {/* Add button */}
                <button
                  onClick={addCategory}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  Add
                </button>
                {/* Cancel button */}
                <button
                  onClick={() => {
                    setShowAddCategory(false)
                    setNewCategoryName('')
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ============ SHOPPING LIST BY CATEGORIES ============ */}
          <div className="space-y-4">
            {visibleCategories.map(category => {
              const categoryItems = getItemsByCategory(category)  // Get items for this category
              const { completed, total } = getCategoryStats(category)  // Get completion stats
              const isCollapsed = collapsedCategories.has(category)  // Check if category is collapsed
              
              return (
                <div key={category} className="border border-gray-200 rounded-xl overflow-hidden">
                  
                  {/* ============ CATEGORY HEADER ============ */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left"
                  >
                    {/* Left side: expand/collapse arrow and category name */}
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                      <span className="font-medium text-gray-800 text-sm">{category}</span>
                    </div>
                    
                    {/* Right side: completion stats and progress bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">
                        {storeMode ? `${completed}/${total} bought` : `${completed}/${total} needed`}
                      </span>
                      {/* Progress bar - only show if there are items */}
                      {total > 0 && (
                        <div className="w-12 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              storeMode ? 'bg-green-500' : 'bg-blue-500'  // Green in store mode, blue in plan mode
                            }`}
                            style={{ width: `${(completed / total) * 100}%` }}  // Percentage width based on completion
                          />
                        </div>
                      )}
                    </div>
                  </button>
                  
                  {/* ============ CATEGORY CONTENT (when expanded) ============ */}
                  {!isCollapsed && (
                    <div className="p-3 space-y-1.5">
                      
                      {/* ============ ADD NEW ITEM FORM ============ */}
                      {/* Only shown in Plan Mode - you don't add items while shopping */}
                      {!storeMode && (
                        <div className="bg-blue-50 rounded-lg p-1.5 border-2 border-dashed border-blue-200 mb-2.5">
                          <div className="flex gap-1.5">
                            {/* Text input for new item name */}
                            <input
                              type="text"
                              placeholder={`Add item to ${category}`}
                              value={newItemInputs[category] || ''}  // Get current input value for this category
                              onChange={(e) => updateNewItemInput(category, e.target.value)}
                              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                              onKeyPress={(e) => e.key === 'Enter' && addItem(category)}  // Allow Enter to submit
                            />
                            {/* Add button - compact design with responsive text */}
                            <button
                              onClick={() => addItem(category)}
                              className="px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1 text-xs font-medium flex-shrink-0"
                            >
                              <Plus size={14} />
                              <span className="hidden xs:inline">Add</span>  {/* Hide text on very small screens */}
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* ============ EXISTING ITEMS LIST ============ */}
                      {categoryItems.map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 rounded-md border transition-all duration-200 ${
                            storeMode 
                              ? (item.bought 
                                  ? 'bg-green-50 border-green-200 opacity-75'      // Bought items: green and faded
                                  : 'bg-white border-gray-200 hover:border-green-300')  // Unbought items: white with green hover
                              : (item.needed 
                                  ? 'bg-blue-50 border-blue-200'                   // Needed items: blue background
                                  : 'bg-white border-gray-200 hover:border-blue-300')   // Unneeded items: white with blue hover
                          }`}
                        >
                          
                          {/* ============ CHECKBOX ============ */}
                          <div className="flex-shrink-0 pl-2">  {/* Container with left padding to move checkbox away from edge */}
                            <button
                              onClick={() => storeMode ? toggleBought(item.id) : toggleNeeded(item.id)}
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                                storeMode
                                  ? (item.bought
                                      ? 'bg-green-500 border-green-500 text-white'    // Bought: filled green
                                      : 'border-gray-300 hover:border-green-500')     // Not bought: empty with green hover
                                  : (item.needed
                                      ? 'bg-blue-500 border-blue-500 text-white'      // Needed: filled blue
                                      : 'border-gray-300 hover:border-blue-500')      // Not needed: empty with blue hover
                              }`}
                            >
                              {/* Show checkmark when item is checked (bought in store mode, needed in plan mode) */}
                              {((storeMode && item.bought) || (!storeMode && item.needed)) && <Check size={14} />}
                            </button>
                          </div>
                          
                          {/* ============ ITEM NAME (CLICKABLE) ============ */}
                          {/* Large clickable area for mobile-friendly checking */}
                          <button
                            onClick={() => storeMode ? toggleBought(item.id) : toggleNeeded(item.id)}
                            className={`flex-1 text-left px-3 py-2 ${
                              storeMode 
                                ? (item.bought ? 'line-through text-gray-500' : 'text-gray-800')  // Strike through bought items
                                : 'text-gray-800'
                            } text-sm`}
                          >
                            {item.name}
                          </button>
                          
                          {/* ============ DELETE BUTTON ============ */}
                          {/* Only shown in Plan Mode - prevent accidental deletion while shopping */}
                          {!storeMode && (
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {/* ============ EMPTY CATEGORY MESSAGE ============ */}
                      {categoryItems.length === 0 && (
                        <div className="text-center py-4 text-gray-500">
                          <p className="text-sm">
                            {storeMode ? `No items needed from ${category}` : `No items in ${category} yet`}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ============ COMPLETELY EMPTY STATE ============ */}
          {/* Shown when there are no visible categories at all */}
          {visibleCategories.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-6xl mb-4">
                {storeMode ? '🛍️' : '📝'}
              </div>
              <p className="text-lg">
                {storeMode ? 'No items to buy today!' : 'Your shopping list is empty'}
              </p>
              <p className="text-sm">
                {storeMode ? 'Mark some items as needed in Plan Mode' : 'Add some items to get started!'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}