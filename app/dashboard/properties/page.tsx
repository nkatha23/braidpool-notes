"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Building, Plus, Edit, Trash2, MapPin, Users, DollarSign, Home } from "lucide-react"

interface Property {
  id: string
  name: string
  address: string
  city: string
  totalUnits: number
  occupiedUnits: number
  monthlyRevenue: number
  status: "active" | "maintenance" | "inactive"
  createdAt: string
}

interface Unit {
  id: string
  propertyId: string
  unitNumber: string
  rent: number
  bedrooms: number
  bathrooms: number
  sqft: number
  status: "occupied" | "vacant" | "maintenance"
  tenantName?: string
  leaseEnd?: string
}

const mockProperties: Property[] = [
  {
    id: "1",
    name: "Sunrise Apartments",
    address: "123 Main Street",
    city: "Nairobi",
    totalUnits: 12,
    occupiedUnits: 10,
    monthlyRevenue: 14400,
    status: "active",
    createdAt: "2023-01-15",
  },
  {
    id: "2",
    name: "Garden View Complex",
    address: "456 Oak Avenue",
    city: "Mombasa",
    totalUnits: 8,
    occupiedUnits: 7,
    monthlyRevenue: 9800,
    status: "active",
    createdAt: "2023-03-20",
  },
  {
    id: "3",
    name: "Downtown Residences",
    address: "789 City Center",
    city: "Kisumu",
    totalUnits: 6,
    occupiedUnits: 4,
    monthlyRevenue: 6000,
    status: "maintenance",
    createdAt: "2023-06-10",
  },
]

const mockUnits: Unit[] = [
  {
    id: "1",
    propertyId: "1",
    unitNumber: "101",
    rent: 1200,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    status: "occupied",
    tenantName: "John Smith",
    leaseEnd: "2024-05-31",
  },
  {
    id: "2",
    propertyId: "1",
    unitNumber: "102",
    rent: 1200,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    status: "occupied",
    tenantName: "Sarah Johnson",
    leaseEnd: "2024-02-29",
  },
  { id: "3", propertyId: "1", unitNumber: "103", rent: 1400, bedrooms: 3, bathrooms: 2, sqft: 1000, status: "vacant" },
  {
    id: "4",
    propertyId: "2",
    unitNumber: "201",
    rent: 1300,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 900,
    status: "occupied",
    tenantName: "Michael Brown",
    leaseEnd: "2024-08-15",
  },
  {
    id: "5",
    propertyId: "2",
    unitNumber: "202",
    rent: 1300,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 900,
    status: "maintenance",
  },
]

export default function PropertiesPage() {
  const [properties, setProperties] = useState(mockProperties)
  const [units, setUnits] = useState(mockUnits)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [showPropertyDialog, setShowPropertyDialog] = useState(false)
  const [showUnitDialog, setShowUnitDialog] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const { toast } = useToast()

  const [propertyForm, setPropertyForm] = useState({
    name: "",
    address: "",
    city: "",
    description: "",
  })

  const [unitForm, setUnitForm] = useState({
    unitNumber: "",
    rent: "",
    bedrooms: "",
    bathrooms: "",
    sqft: "",
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
      case "occupied":
        return "bg-secondary text-secondary-foreground"
      case "vacant":
        return "bg-yellow-100 text-yellow-800"
      case "maintenance":
        return "bg-blue-100 text-blue-800"
      case "inactive":
        return "bg-muted text-muted-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const handlePropertySubmit = () => {
    if (!propertyForm.name || !propertyForm.address || !propertyForm.city) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    if (editingProperty) {
      setProperties((prev) => prev.map((p) => (p.id === editingProperty.id ? { ...p, ...propertyForm } : p)))
      toast({
        title: "Property updated",
        description: `${propertyForm.name} has been updated successfully.`,
        className: "bg-secondary text-secondary-foreground",
      })
    } else {
      const newProperty: Property = {
        id: Date.now().toString(),
        ...propertyForm,
        totalUnits: 0,
        occupiedUnits: 0,
        monthlyRevenue: 0,
        status: "active",
        createdAt: new Date().toISOString().split("T")[0],
      }
      setProperties((prev) => [...prev, newProperty])
      toast({
        title: "Property added",
        description: `${propertyForm.name} has been added successfully.`,
        className: "bg-secondary text-secondary-foreground",
      })
    }

    setPropertyForm({ name: "", address: "", city: "", description: "" })
    setEditingProperty(null)
    setShowPropertyDialog(false)
  }

  const handleUnitSubmit = () => {
    if (!selectedProperty || !unitForm.unitNumber || !unitForm.rent) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    if (editingUnit) {
      setUnits((prev) =>
        prev.map((u) =>
          u.id === editingUnit.id
            ? {
                ...u,
                unitNumber: unitForm.unitNumber,
                rent: Number(unitForm.rent),
                bedrooms: Number(unitForm.bedrooms) || 1,
                bathrooms: Number(unitForm.bathrooms) || 1,
                sqft: Number(unitForm.sqft) || 0,
              }
            : u,
        ),
      )
      toast({
        title: "Unit updated",
        description: `Unit ${unitForm.unitNumber} has been updated successfully.`,
        className: "bg-secondary text-secondary-foreground",
      })
    } else {
      const newUnit: Unit = {
        id: Date.now().toString(),
        propertyId: selectedProperty.id,
        unitNumber: unitForm.unitNumber,
        rent: Number(unitForm.rent),
        bedrooms: Number(unitForm.bedrooms) || 1,
        bathrooms: Number(unitForm.bathrooms) || 1,
        sqft: Number(unitForm.sqft) || 0,
        status: "vacant",
      }
      setUnits((prev) => [...prev, newUnit])

      // Update property unit count
      setProperties((prev) =>
        prev.map((p) => (p.id === selectedProperty.id ? { ...p, totalUnits: p.totalUnits + 1 } : p)),
      )

      toast({
        title: "Unit added",
        description: `Unit ${unitForm.unitNumber} has been added successfully.`,
        className: "bg-secondary text-secondary-foreground",
      })
    }

    setUnitForm({ unitNumber: "", rent: "", bedrooms: "", bathrooms: "", sqft: "" })
    setEditingUnit(null)
    setShowUnitDialog(false)
  }

  const editProperty = (property: Property) => {
    setEditingProperty(property)
    setPropertyForm({
      name: property.name,
      address: property.address,
      city: property.city,
      description: "",
    })
    setShowPropertyDialog(true)
  }

  const editUnit = (unit: Unit) => {
    setEditingUnit(unit)
    setUnitForm({
      unitNumber: unit.unitNumber,
      rent: unit.rent.toString(),
      bedrooms: unit.bedrooms.toString(),
      bathrooms: unit.bathrooms.toString(),
      sqft: unit.sqft.toString(),
    })
    setShowUnitDialog(true)
  }

  const deleteProperty = (property: Property) => {
    setProperties((prev) => prev.filter((p) => p.id !== property.id))
    setUnits((prev) => prev.filter((u) => u.propertyId !== property.id))
    toast({
      title: "Property deleted",
      description: `${property.name} has been deleted.`,
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const deleteUnit = (unit: Unit) => {
    setUnits((prev) => prev.filter((u) => u.id !== unit.id))
    setProperties((prev) =>
      prev.map((p) => (p.id === unit.propertyId ? { ...p, totalUnits: Math.max(0, p.totalUnits - 1) } : p)),
    )
    toast({
      title: "Unit deleted",
      description: `Unit ${unit.unitNumber} has been deleted.`,
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const propertyUnits = selectedProperty ? units.filter((u) => u.propertyId === selectedProperty.id) : []

  const stats = {
    totalProperties: properties.length,
    totalUnits: properties.reduce((sum, p) => sum + p.totalUnits, 0),
    occupiedUnits: properties.reduce((sum, p) => sum + p.occupiedUnits, 0),
    totalRevenue: properties.reduce((sum, p) => sum + p.monthlyRevenue, 0),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Properties</h2>
          <p className="text-muted-foreground">Manage your properties and units.</p>
        </div>
        <Dialog open={showPropertyDialog} onOpenChange={setShowPropertyDialog}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingProperty(null)
                setPropertyForm({ name: "", address: "", city: "", description: "" })
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProperty ? "Edit Property" : "Add New Property"}</DialogTitle>
              <DialogDescription>
                {editingProperty ? "Update property information" : "Enter the details for your new property"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="property-name">Property Name *</Label>
                <Input
                  id="property-name"
                  value={propertyForm.name}
                  onChange={(e) => setPropertyForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Sunrise Apartments"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-address">Address *</Label>
                <Input
                  id="property-address"
                  value={propertyForm.address}
                  onChange={(e) => setPropertyForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="e.g., 123 Main Street"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-city">City *</Label>
                <Select
                  value={propertyForm.city}
                  onValueChange={(value) => setPropertyForm((prev) => ({ ...prev, city: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nairobi">Nairobi</SelectItem>
                    <SelectItem value="Mombasa">Mombasa</SelectItem>
                    <SelectItem value="Kisumu">Kisumu</SelectItem>
                    <SelectItem value="Nakuru">Nakuru</SelectItem>
                    <SelectItem value="Eldoret">Eldoret</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="property-description">Description</Label>
                <Textarea
                  id="property-description"
                  value={propertyForm.description}
                  onChange={(e) => setPropertyForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description of the property"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowPropertyDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handlePropertySubmit}>{editingProperty ? "Update Property" : "Add Property"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProperties}</div>
            <p className="text-xs text-muted-foreground">Active properties</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Units</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUnits}</div>
            <p className="text-xs text-muted-foreground">Across all properties</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Users className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">
              {stats.totalUnits > 0 ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.occupiedUnits} of {stats.totalUnits} units
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">${stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total expected</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Properties List */}
        <Card>
          <CardHeader>
            <CardTitle>Properties</CardTitle>
            <CardDescription>Your property portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {properties.map((property) => (
                <div
                  key={property.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                    selectedProperty?.id === property.id ? "border-primary bg-primary/5" : ""
                  }`}
                  onClick={() => setSelectedProperty(property)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{property.name}</h4>
                    <Badge className={getStatusColor(property.status)}>{property.status}</Badge>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
                    <MapPin className="h-3 w-3" />
                    <span>
                      {property.address}, {property.city}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {property.occupiedUnits}/{property.totalUnits} units occupied
                    </span>
                    <span className="font-semibold text-secondary">${property.monthlyRevenue}/month</span>
                  </div>
                  <div className="flex justify-end space-x-2 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        editProperty(property)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteProperty(property)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Units Management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Units</CardTitle>
              <CardDescription>
                {selectedProperty ? `Units in ${selectedProperty.name}` : "Select a property to view units"}
              </CardDescription>
            </div>
            {selectedProperty && (
              <Dialog open={showUnitDialog} onOpenChange={setShowUnitDialog}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingUnit(null)
                      setUnitForm({ unitNumber: "", rent: "", bedrooms: "", bathrooms: "", sqft: "" })
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Unit
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingUnit ? "Edit Unit" : "Add New Unit"}</DialogTitle>
                    <DialogDescription>
                      {editingUnit ? "Update unit information" : `Add a new unit to ${selectedProperty.name}`}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="unit-number">Unit Number *</Label>
                      <Input
                        id="unit-number"
                        value={unitForm.unitNumber}
                        onChange={(e) => setUnitForm((prev) => ({ ...prev, unitNumber: e.target.value }))}
                        placeholder="e.g., 101, A1, etc."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unit-rent">Monthly Rent *</Label>
                      <Input
                        id="unit-rent"
                        type="number"
                        value={unitForm.rent}
                        onChange={(e) => setUnitForm((prev) => ({ ...prev, rent: e.target.value }))}
                        placeholder="e.g., 1200"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="unit-bedrooms">Bedrooms</Label>
                        <Input
                          id="unit-bedrooms"
                          type="number"
                          value={unitForm.bedrooms}
                          onChange={(e) => setUnitForm((prev) => ({ ...prev, bedrooms: e.target.value }))}
                          placeholder="1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unit-bathrooms">Bathrooms</Label>
                        <Input
                          id="unit-bathrooms"
                          type="number"
                          step="0.5"
                          value={unitForm.bathrooms}
                          onChange={(e) => setUnitForm((prev) => ({ ...prev, bathrooms: e.target.value }))}
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unit-sqft">Square Feet</Label>
                      <Input
                        id="unit-sqft"
                        type="number"
                        value={unitForm.sqft}
                        onChange={(e) => setUnitForm((prev) => ({ ...prev, sqft: e.target.value }))}
                        placeholder="800"
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setShowUnitDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleUnitSubmit}>{editingUnit ? "Update Unit" : "Add Unit"}</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {!selectedProperty ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a property to manage its units</p>
              </div>
            ) : propertyUnits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No units added yet</p>
                <p className="text-sm">Click "Add Unit" to get started</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unit</TableHead>
                      <TableHead>Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propertyUnits.map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{unit.unitNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {unit.bedrooms}BR/{unit.bathrooms}BA • {unit.sqft} sqft
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">${unit.rent}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(unit.status)}>{unit.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {unit.tenantName ? (
                            <div>
                              <div className="font-medium">{unit.tenantName}</div>
                              {unit.leaseEnd && (
                                <div className="text-xs text-muted-foreground">Lease ends: {unit.leaseEnd}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => editUnit(unit)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteUnit(unit)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
