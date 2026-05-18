import { useState, useRef, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useListBanks } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UploadCloud, File, AlertCircle, Loader2, Info, CheckCircle2, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function Generate() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: banks, isLoading: loadingBanks } = useListBanks();

  const [bankId, setBankId] = useState<string>("");
  const [auditType, setAuditType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    message: string;
    missing: string[];
    found: string[];
    fileRows: number;
    fileColumns: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedBank = useMemo(() => banks?.find(b => b.id.toString() === bankId), [banks, bankId]);
  const availableAuditTypes = selectedBank?.auditTypes || [];
  
  const handleBankChange = (val: string) => {
    setBankId(val);
    setAuditType("");
    setValidationResult(null);
    setError(null);
  };
  
  const handleAuditTypeChange = (val: string) => {
    setAuditType(val);
    setValidationResult(null);
    setError(null);
    if (file) {
      validateFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        setFile(droppedFile);
        setError(null);
        setValidationResult(null);
        validateFile(droppedFile);
      } else {
        setError("Please upload a valid Excel file (.xlsx or .xls)");
      }
    }
  };

  const validateFile = async (fileToValidate: File) => {
    if (!bankId || !auditType) {
      setValidationResult(null);
      return;
    }
    
    setIsValidating(true);
    setValidationResult(null);
    
    const formData = new FormData();
    formData.append("bankId", bankId);
    formData.append("auditType", auditType);
    formData.append("file", fileToValidate);
    
    try {
      const response = await fetch("/api/jobs/validate", {
        method: "POST",
        body: formData,
      });
      
      const result = await response.json();
      setValidationResult(result);
      
      if (!result.valid) {
        setError(result.message);
      } else {
        setError(null);
      }
    } catch (err) {
      console.error("Validation error:", err);
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setValidationResult(null);
      validateFile(selectedFile);
    }
  };

  useEffect(() => {
    if (file && bankId && auditType) {
      validateFile(file);
    }
  }, [bankId, auditType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!bankId || !auditType || !file) {
      setError("Please fill all required fields and select a file.");
      return;
    }
    
    if (validationResult && !validationResult.valid) {
      setError("Please fix the missing columns in your Excel file before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("bankId", bankId);
    formData.append("auditType", auditType);
    formData.append("file", file);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Failed to submit job");
      }

      const job = await response.json();
      
      toast({
        title: "Job created successfully",
        description: "Your file is being processed.",
      });
      
      setLocation(`/jobs/${job.id}`);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Derive column stats for the selected bank
  const excelColumnsCount = selectedBank?.columnMapping?.columns?.filter(c => c.excelColumn !== null).length || 0;
  const blankColumnsCount = selectedBank?.columnMapping?.columns?.filter(c => c.excelColumn === null).length || 0;
  const totalColumnsCount = selectedBank?.columnMapping?.columns?.length || 0;

  // Derive unique required excel columns
  const requiredExcelCols = useMemo(() => {
    if (!selectedBank) return [];
    const cols = new Set<string>();
    if (selectedBank.columnMapping.branchGroupBy) cols.add(selectedBank.columnMapping.branchGroupBy);
    if (selectedBank.columnMapping.branchNameCol) cols.add(selectedBank.columnMapping.branchNameCol);
    if (selectedBank.columnMapping.stateCol) cols.add(selectedBank.columnMapping.stateCol);
    
    selectedBank.columnMapping.columns?.forEach(c => {
      if (c.excelColumn) cols.add(c.excelColumn);
    });
    return Array.from(cols);
  }, [selectedBank]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate PDFs</h1>
        <p className="text-muted-foreground mt-1">Upload an Excel sheet to generate branch-wise PDF reports.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-7 lg:col-span-8">
          <Card className="shadow-sm border-muted/50 h-full">
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
              <CardHeader>
                <CardTitle>Job Details</CardTitle>
                <CardDescription>Select the bank configuration and upload your data.</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6 flex-1">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank">Bank</Label>
                    <Select value={bankId} onValueChange={handleBankChange}>
                      <SelectTrigger id="bank" disabled={loadingBanks}>
                        <SelectValue placeholder={loadingBanks ? "Loading..." : "Select bank"} />
                      </SelectTrigger>
                      <SelectContent>
                        {banks?.filter(b => b.isActive).map(bank => (
                          <SelectItem key={bank.id} value={bank.id.toString()}>{bank.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="auditType">Audit Type</Label>
                    <Select value={auditType} onValueChange={handleAuditTypeChange} disabled={!bankId || availableAuditTypes.length === 0}>
                      <SelectTrigger id="auditType">
                        <SelectValue placeholder="Select audit type" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAuditTypes.map(type => (
                          <SelectItem key={type.code} value={type.code}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Data File (Excel)</Label>
                  <div 
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                      isDragging ? 'border-primary bg-primary/5' : 
                      file ? 'border-muted-foreground/30 bg-muted/10' : 
                      'border-muted hover:border-primary/50 hover:bg-muted/20'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept=".xlsx,.xls" 
                      className="hidden" 
                    />
                    
                    {file ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                          <File className="h-6 w-6" />
                        </div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="mt-2 text-destructive">
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-2">
                          <UploadCloud className="h-6 w-6" />
                        </div>
                        <p className="font-medium text-foreground">Drag & drop your Excel file here</p>
                        <p className="text-xs text-muted-foreground mt-1">or click to browse from your computer</p>
                      </div>
                    )}
                  </div>
                  
                  {selectedBank && requiredExcelCols.length > 0 && !file && (
                    <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-blue-800 dark:text-blue-300 mb-2">
                        <Info className="h-4 w-4" />
                        What your Excel file needs
                      </h4>
                      <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mb-3">
                        Your uploaded file must contain the following exact column headers to process successfully:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {requiredExcelCols.map(col => (
                          <Badge key={col} variant="secondary" className="bg-white dark:bg-black font-mono text-xs border-blue-200 dark:border-blue-800">
                            {col}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {isValidating && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-muted flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-sm">Validating Excel file...</span>
                    </div>
                  )}
                  
                  {validationResult && (
                    <div className={`mt-4 p-4 rounded-lg border ${
                      validationResult.valid 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {validationResult.valid ? (
                          <>
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <span className="font-semibold text-green-800 dark:text-green-300">File is valid</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <span className="font-semibold text-red-800 dark:text-red-300">Missing columns</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{validationResult.message}</p>
                      
                      {validationResult.valid ? (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{validationResult.fileRows} data rows</span>
                          <span>•</span>
                          <span>{validationResult.fileColumns} columns</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {validationResult.missing.map(col => (
                            <Badge key={col} variant="destructive" className="font-mono text-xs">
                              {col}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
              
              <CardFooter className="border-t bg-muted/20 py-4 flex justify-end">
                <Button 
                  type="submit" 
                  size="lg" 
                  disabled={isSubmitting || !bankId || !auditType || !file || (validationResult !== null && !validationResult.valid)}
                  className="w-full sm:w-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting Job...
                    </>
                  ) : "Generate PDFs"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        <div className="md:col-span-5 lg:col-span-4">
          <Card className="shadow-sm border-muted/50 h-full bg-muted/10">
            {selectedBank ? (
              <>
                <CardHeader className="pb-3 border-b border-muted/50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Bank Selected
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-5">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedBank.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{selectedBank.description || "No description provided."}</p>
                  </div>
                  
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Available Audits</span>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedBank.auditTypes.map(t => (
                        <Badge key={t.code} variant="secondary">{t.label} ({t.code})</Badge>
                      ))}
                    </div>
                  </div>

                  <Separator />
                  
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">PDF Configuration</span>
                    <p className="text-sm mt-2 mb-3">
                      <strong className="text-foreground">{totalColumnsCount} total columns</strong> configured for the output PDF.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-background border rounded-lg p-3">
                        <div className="text-2xl font-bold text-primary">{excelColumnsCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">From Excel</div>
                      </div>
                      <div className="bg-background border rounded-lg p-3">
                        <div className="text-2xl font-bold text-muted-foreground">{blankColumnsCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">Blank (Hand-fill)</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Info className="h-10 w-10 mb-4 opacity-50" />
                <p>Select a bank to view its configuration requirements and column mapping details.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
