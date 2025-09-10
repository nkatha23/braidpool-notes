"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Download, FileText, Calendar, Filter, Loader2, CheckCircle } from "lucide-react"

interface ReportTemplate {
  id: string
  name: string
  description: string
  type: "financial" | "tenant" | "maintenance" | "occupancy"
  fields: string[]
}

interface GeneratedReport {
  id: string
  name: string
  type: string
  dateRange: string
  generatedAt: string
  status: "generating" | "ready" | "failed"
  downloadUrl?: string
}

const reportTemplates: ReportTemplate[] = [
  {
    id: "rent-collection",
    name: "Rent Collection Report",
    description: "Detailed breakdown of rent payments and outstanding amounts",
    type: "financial",
    fields: ["Tenant Name", "Unit", "Rent Amount", "Payment Status", "Payment Date", "Method"],
  },
  {
    id: "tenant-list",
    name: "Tenant Directory",
    description: "Complete list of tenants with contact information and lease details",
    type: "tenant",
    fields: ["Name", "Email", "Phone", "Unit", "Lease Start", "Lease End", "Rent Amount"],
  },
  {
    id: "financial-summary",
    name: "Financial Summary",
    description: "Monthly/quarterly financial overview with income and expenses",
    type: "financial",
    fields: ["Month", "Total Rent", "Collected", "Outstanding", "Collection Rate", "Expenses"],
  },
  {
    id: "occupancy-report",
    name: "Occupancy Report",
    description: "Property occupancy rates and vacancy analysis",
    type: "occupancy",
    fields: ["Unit", "Status", "Tenant", "Lease Start", "Lease End", "Vacancy Days"],
  },
  {
    id: "payment-methods",
    name: "Payment Methods Analysis",
    description: "Breakdown of payment methods used by tenants",
    type: "financial",
    fields: ["Payment Method", "Usage Count", "Total Amount", "Percentage"],
  },
]

export default function ReportsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [dateRange, setDateRange] = useState("last-month")
  const [customStartDate, setCustomStartDate] = useState("")
  const [customEndDate, setCustomEndDate] = useState("")
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [format, setFormat] = useState("csv")
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([
    {
      id: "1",
      name: "Rent Collection Report - December 2023",
      type: "financial",
      dateRange: "Dec 1-31, 2023",
      generatedAt: "2024-01-05 10:30 AM",
      status: "ready",
      downloadUrl: "#",
    },
    {
      id: "2",
      name: "Tenant Directory - Q4 2023",
      type: "tenant",
      dateRange: "Oct-Dec 2023",
      generatedAt: "2024-01-03 2:15 PM",
      status: "ready",
      downloadUrl: "#",
    },
  ])
  const { toast } = useToast()

  const selectedTemplateData = reportTemplates.find((t) => t.id === selectedTemplate)

  const handleFieldToggle = (field: string) => {
    setSelectedFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]))
  }

  const generateReport = async () => {
    if (!selectedTemplate) {
      toast({
        title: "Template required",
        description: "Please select a report template to continue.",
        variant: "destructive",
      })
      return
    }

    if (selectedFields.length === 0) {
      toast({
        title: "Fields required",
        description: "Please select at least one field to include in the report.",
        variant: "destructive",
      })
      return
    }

    const template = reportTemplates.find((t) => t.id === selectedTemplate)
    if (!template) return

    const newReport: GeneratedReport = {
      id: Date.now().toString(),
      name: `${template.name} - ${new Date().toLocaleDateString()}`,
      type: template.type,
      dateRange: dateRange === "custom" ? `${customStartDate} to ${customEndDate}` : dateRange,
      generatedAt: new Date().toLocaleString(),
      status: "generating",
    }

    setGeneratedReports((prev) => [newReport, ...prev])

    toast({
      title: "Report generation started",
      description: "Your report is being generated. You'll be notified when it's ready.",
      className: "bg-secondary text-secondary-foreground",
    })

    // Simulate report generation
    setTimeout(() => {
      setGeneratedReports((prev) =>
        prev.map((report) => (report.id === newReport.id ? { ...report, status: "ready", downloadUrl: "#" } : report)),
      )

      toast({
        title: "Report ready!",
        description: `${template.name} has been generated successfully.`,
        className: "bg-secondary text-secondary-foreground",
      })
    }, 3000)

    // Reset form
    setSelectedTemplate("")
    setSelectedFields([])
  }

  const downloadReport = (report: GeneratedReport) => {
    toast({
      title: "Download started",
      description: `Downloading ${report.name}`,
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-secondary text-secondary-foreground"
      case "generating":
        return "bg-yellow-100 text-yellow-800"
      case "failed":
        return "bg-destructive text-destructive-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "financial":
        return "text-secondary"
      case "tenant":
        return "text-primary"
      case "maintenance":
        return "text-blue-600"
      case "occupancy":
        return "text-purple-600"
      default:
        return "text-muted-foreground"
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground">Generate and download detailed reports for your properties.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Report Generator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Generate New Report</span>
            </CardTitle>
            <CardDescription>Create custom reports with your preferred data and format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Template Selection */}
            <div className="space-y-2">
              <Label>Report Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a report template" />
                </SelectTrigger>
                <SelectContent>
                  {reportTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplateData && (
                <p className="text-sm text-muted-foreground">{selectedTemplateData.description}</p>
              )}
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-week">Last Week</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="last-quarter">Last Quarter</SelectItem>
                  <SelectItem value="last-year">Last Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              {dateRange === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="start-date" className="text-xs">
                      Start Date
                    </Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date" className="text-xs">
                      End Date
                    </Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Field Selection */}
            {selectedTemplateData && (
              <div className="space-y-2">
                <Label>Include Fields</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedTemplateData.fields.map((field) => (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox
                        id={field}
                        checked={selectedFields.includes(field)}
                        onCheckedChange={() => handleFieldToggle(field)}
                      />
                      <Label htmlFor={field} className="text-sm cursor-pointer">
                        {field}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="flex space-x-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedFields(selectedTemplateData.fields)}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedFields([])}>
                    Clear All
                  </Button>
                </div>
              </div>
            )}

            {/* Format Selection */}
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (Excel Compatible)</SelectItem>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="xlsx">Excel Spreadsheet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={generateReport} className="w-full">
              <FileText className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
          </CardContent>
        </Card>

        {/* Generated Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Download className="h-5 w-5" />
              <span>Generated Reports</span>
            </CardTitle>
            <CardDescription>Download your previously generated reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {generatedReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No reports generated yet</p>
                </div>
              ) : (
                generatedReports.map((report) => (
                  <div key={report.id} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{report.name}</h4>
                      <Badge className={getStatusColor(report.status)}>
                        {report.status === "generating" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {report.status === "ready" && <CheckCircle className="mr-1 h-3 w-3" />}
                        {report.status}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span className={getTypeColor(report.type)}>{report.type}</span>
                      <span>•</span>
                      <span>{report.dateRange}</span>
                      <span>•</span>
                      <span>{report.generatedAt}</span>
                    </div>
                    {report.status === "ready" && (
                      <Button variant="outline" size="sm" onClick={() => downloadReport(report)} className="w-full">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Reports</CardTitle>
          <CardDescription>Generate common reports with one click</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2 bg-transparent">
              <Calendar className="h-6 w-6 text-secondary" />
              <span className="font-medium">Monthly Summary</span>
              <span className="text-xs text-muted-foreground">Current month overview</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2 bg-transparent">
              <Filter className="h-6 w-6 text-primary" />
              <span className="font-medium">Overdue Payments</span>
              <span className="text-xs text-muted-foreground">Outstanding rent report</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2 bg-transparent">
              <FileText className="h-6 w-6 text-blue-600" />
              <span className="font-medium">Tenant Contacts</span>
              <span className="text-xs text-muted-foreground">Complete directory</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2 bg-transparent">
              <Download className="h-6 w-6 text-purple-600" />
              <span className="font-medium">Tax Summary</span>
              <span className="text-xs text-muted-foreground">Annual tax report</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
