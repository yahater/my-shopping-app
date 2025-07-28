'use client'

import { useState, useEffect } from 'react'
import { Plus, Check, ChevronDown, ChevronRight, Trash2, ShoppingCart, Home, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ShoppingList({ session }) {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [newItemInputs, setNewItemInputs] = useState({})
  const [collapsedCategories, setCollapsedCategories] = useState(new Set())
  const [storeMode, setStoreMode] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [loading, setLoading] = useState(true)

  // Default categories
  const defaultCategories = [
    'Refrigerated items', 'Bread', 'Fruit/Veg', 'Frozen', 'Bulk', 'Household items', 'Amy', 'Dm', 'Bipa'
  ]

  // Fetch items from Supabase
  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error('Error fetching items:', error)
    }
  }

  // Fetch categories from Supabase
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      
      const userCategories = data?.map(cat => cat.name) || []
      const allCategories = [...defaultCategories, ...userCategories.filter(cat => !defaultCategories.includes(cat))]
      setCategories(allCategories)
    } catch (error) {
      console.error('Error fetching categories:', error)
      setCategories(defaultCategories)
    }
  }

  // Initialize data
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true)
      await Promise.all([fetchItems(), fetchCategories()])
      setLoading(false)
    }

    if (session?.user?.id) {
      initializeData()
    }
  }, [session?.user?.id])

  // Set up real-time subscriptions
  useEffect(() => {
    if (!session?.user?.id) return

    const itemsSubscription = supabase
      .channel('shopping_items_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'shopping_items',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          fetchItems()
        }
      )
      .subscribe()

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
          fetchCategories()
        }
      )
      .subscribe()

    return () => {
      itemsSubscription.unsubscribe()
      categoriesSubscription.unsubscribe()
    }
  }, [session?.user?.id])

  const addCategory = async () => {
    if (!newCategoryName.trim() || categories.includes(newCategoryName.trim())) return

    try {
      const { error } = await supabase
        .from('categories')
        .insert([{
          name: newCategoryName.trim(),
          user_id: session.user.id
        }])

      if (error) throw error

      setNewCategoryName('')
      setShowAddCategory(false)
      await fetchCategories()
    } catch (error) {
      console.error('Error adding category:', error)
    }
  }

  const addItem = async (category) => {
    const inputValue = newItemInputs[category] || ''
    if (!inputValue.trim()) return

    try {
      const { error } = await supabase
        .from('shopping_items')
        .insert([{
          name: inputValue.trim(),
          category: category,
          needed: false,
          bought: false,
          user_id: session.user.id
        }])

      if (error) throw error

      setNewItemInputs({ ...newItemInputs, [category]: '' })
      await fetchItems()
    } catch (error) {
      console.error('Error adding item:', error)
    }
  }

  const updateNewItemInput = (category, value) => {
    setNewItemInputs({ ...newItemInputs, [category]: value })
  }

  const toggleNeeded = async (id) => {
    const item = items.find(item => item.id === id)
    if (!item) return

    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ needed: !item.needed })
        .eq('id', id)
        .eq('user_id', session.user.id)

      if (error) throw error
      await fetchItems()
    } catch (error) {
      console.error('Error updating item:', error)
    }
  }

  const toggleBought = async (id) => {
    const item = items.find(item => item.id === id)
    if (!item) return

    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ bought: !item.bought })
        .eq('id', id)
        .eq('user_id', session.user.id)

      if (error) throw error
      await fetchItems()
    } catch (error) {
      console.error('Error updating item:', error)
    }
  }

  const deleteItem = async (id) => {
    try {
      const { error } = await supabase
        .from('shopping_items')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id)

      if (error) throw error
      await fetchItems()
    } catch (error) {
      console.error('Error deleting item:', error)
    }
  }

  const resetShopping = async () => {
    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ needed: false, bought: false })
        .eq('user_id', session.user.id)

      if (error) throw error

      setStoreMode(false)
      await fetchItems()
    } catch (error) {
      console.error('Error resetting shopping:', error)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const toggleCategory = (category) => {
    const newCollapsed = new Set(collapsedCategories)
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category)
    } else {
      newCollapsed.add(category)
    }
    setCollapsedCategories(newCollapsed)
  }

  const getItemsByCategory = (category) => {
    if (storeMode) {
      return items.filter(item => item.category === category && item.needed)
    }
    return items.filter(item => item.category === category)
  }

  const getCategoryStats = (category) => {
    const categoryItems = getItemsByCategory(category)
    if (storeMode) {
      const bought = categoryItems.filter(item => item.bought).length
      const total = categoryItems.length
      return { completed: bought, total }
    } else {
      const needed = categoryItems.filter(item => item.needed).length
      const total = categoryItems.length
      return { completed: needed, total }
    }
  }

  const getNeededItemsCount = () => {
    return items.filter(item => item.needed && !item.bought).length
  }

  const getBoughtItemsCount = () => {
    return items.filter(item => item.needed && item.bought).length
  }

  // Filter categories to only show those with items
  const visibleCategories = categories.filter(category => {
    const categoryItems = getItemsByCategory(category)
    return categoryItems.length > 0 || !storeMode
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading your shopping list...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                🛒 Shopping List
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome, {session.user.email}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Sign out button */}
              <button
                onClick={signOut}
                className="px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-1 text-sm"
              >
                <LogOut size={16} />
                Sign Out
              </button>

              {/* Reset Button (only in store mode) */}
              {storeMode && (
                <button
                  onClick={resetShopping}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Reset Trip
                </button>
              )}
              
              {/* Mode Toggle */}
              <button
                onClick={() => setStoreMode(!storeMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  storeMode 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {storeMode ? <ShoppingCart size={20} /> : <Home size={20} />}
                {storeMode ? 'Store Mode' : 'Plan Mode'}
              </button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            {storeMode ? (
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Shopping Today</h2>
                <div className="flex justify-center gap-6 text-sm">
                  <span className="text-green-600 font-medium">
                    ✓ {getBoughtItemsCount()} bought
                  </span>
                  <span className="text-blue-600 font-medium">
                    🛒 {getNeededItemsCount()} remaining
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Shopping Plan</h2>
                <div className="flex justify-center items-center gap-4">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-blue-600">{getNeededItemsCount()}</span> items needed for next trip
                  </div>
                  <button
                    onClick={() => setShowAddCategory(true)}
                    className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center gap-1"
                  >
                    <Plus size={14} />
                    Add Category
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Add Category Modal/Form */}
          {showAddCategory && !storeMode && (
            <div className="bg-purple-50 rounded-xl p-4 mb-6 border-2 border-dashed border-purple-200">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">Add New Category</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Enter category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  onKeyPress={(e) => e.key === 'Enter' && addCategory()}
                  autoFocus
                />
                <button
                  onClick={addCategory}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  Add
                </button>
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

          {/* Shopping list by categories */}
          <div className="space-y-4">
            {visibleCategories.map(category => {
              const categoryItems = getItemsByCategory(category)
              const { completed, total } = getCategoryStats(category)
              const isCollapsed = collapsedCategories.has(category)
              
              return (
                <div key={category} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                      <span className="font-semibold text-gray-800">{category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {storeMode ? `${completed}/${total} bought` : `${completed}/${total} needed`}
                      </span>
                      {total > 0 && (
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${
                              storeMode ? 'bg-green-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${(completed / total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                  
                  {!isCollapsed && (
                    <div className="p-4 space-y-2">
                      {/* Add new item for this category (only in plan mode) */}
                      {!storeMode && (
                        <div className="bg-blue-50 rounded-lg p-3 border-2 border-dashed border-blue-200 mb-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder={`Add item to ${category}`}
                              value={newItemInputs[category] || ''}
                              onChange={(e) => updateNewItemInput(category, e.target.value)}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                              onKeyPress={(e) => e.key === 'Enter' && addItem(category)}
                            />
                            <button
                              onClick={() => addItem(category)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm font-medium"
                            >
                              <Plus size={16} />
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Existing items */}
                      {categoryItems.map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ${
                            storeMode 
                              ? (item.bought 
                                  ? 'bg-green-50 border-green-200 opacity-75' 
                                  : 'bg-white border-gray-200 hover:border-green-300')
                              : (item.needed 
                                  ? 'bg-blue-50 border-blue-200' 
                                  : 'bg-white border-gray-200 hover:border-blue-300')
                          }`}
                        >
                          <button
                            onClick={() => storeMode ? toggleBought(item.id) : toggleNeeded(item.id)}
                            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                              storeMode
                                ? (item.bought
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-gray-300 hover:border-green-500')
                                : (item.needed
                                    ? 'bg-blue-500 border-blue-500 text-white'
                                    : 'border-gray-300 hover:border-blue-500')
                            }`}
                          >
                            {((storeMode && item.bought) || (!storeMode && item.needed)) && <Check size={16} />}
                          </button>
                          
                          <span className={`flex-1 ${
                            storeMode 
                              ? (item.bought ? 'line-through text-gray-500' : 'text-gray-800')
                              : 'text-gray-800'
                          }`}>
                            {item.name}
                          </span>
                          
                          {!storeMode && (
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {categoryItems.length === 0 && (
                        <div className="text-center py-6 text-gray-500">
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