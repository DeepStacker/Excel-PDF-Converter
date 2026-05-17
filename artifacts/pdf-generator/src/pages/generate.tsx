import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useListBanks } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UploadCloud, File, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedBank = banks?.find(b => b.id.toString() === bankId);
  const availableAuditTypes = selectedBank?.auditTypes || [];

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
      } else {
        setError("Please upload a valid Excel file (.xlsx or .xls)");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!bankId || !auditType || !file) {
      setError("Please fill all required fields and select a file.");
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
        throw new Error(errorData.message || "Failed to submit job");
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate PDFs</h1>
        <p className="text-muted-foreground mt-1">Upload an Excel sheet to generate branch-wise PDF reports.</p>
      </div>

      <Card className="shadow-sm border-muted/50">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
            <CardDescription>Select the bank configuration and upload your data.</CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bank">Bank</Label>
                <Select value={bankId} onValueChange={(val) => { setBankId(val); setAuditType(""); }}>
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
                <Select value={auditType} onValueChange={setAuditType} disabled={!bankId || availableAuditTypes.length === 0}>
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
                    <p className="font-medium text-muted-foreground">Drag & drop your Excel file here</p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse from your computer</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="border-t bg-muted/20 py-4 flex justify-end">
            <Button 
              type="submit" 
              size="lg" 
              disabled={isSubmitting || !bankId || !auditType || !file}
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
  );
}
