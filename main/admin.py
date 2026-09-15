from django.contrib import admin
from .models import Client, Inspection, FoodSafetyAgencyInspection, Shipment, Settings, SystemLog, InspectorMapping, InspectionDocument, UserOTP

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ['client_id', 'name', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name', 'client_id']
    ordering = ['name']
    readonly_fields = ['client_id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name',)
        }),
        ('System Information', {
            'fields': ('client_id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )




@admin.register(FoodSafetyAgencyInspection)
class FoodSafetyAgencyInspectionAdmin(admin.ModelAdmin):
    list_display = ['inspector_name', 'client_name', 'commodity', 'date_of_inspection', 'is_sample_taken', 'needs_retest']
    list_filter = ['commodity', 'date_of_inspection', 'inspector_name', 'is_sample_taken', 'is_direction_present_for_this_inspection', 'needs_retest']
    search_fields = ['inspector_name', 'client_name', 'commodity']
    ordering = ['-date_of_inspection', '-created_at']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Inspection Details', {
            'fields': ('commodity', 'date_of_inspection', 'start_of_inspection', 'end_of_inspection')
        }),
        ('Inspector Information', {
            'fields': ('inspector_id', 'inspector_name')
        }),
        ('Client Information', {
            'fields': ('client_name',)
        }),
        ('Location Information', {
            'fields': ('inspection_location_type_id', 'latitude', 'longitude')
        }),
        ('Inspection Activities', {
            'fields': ('is_direction_present_for_this_inspection', 'is_sample_taken', 'inspection_travel_distance_km')
        }),
        ('Testing Parameters', {
            'fields': ('fat', 'protein', 'calcium', 'dna', 'needs_retest')
        }),
        ('Reference Information', {
            'fields': ('remote_id',)
        }),
        ('System Information', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

@admin.register(InspectionDocument)
class InspectionDocumentAdmin(admin.ModelAdmin):
    list_display = ['inspection', 'document_type', 'uploaded_by', 'uploaded_date']
    list_filter = ['document_type', 'uploaded_date']
    search_fields = ['inspection__client_name']
    ordering = ['-uploaded_date']

@admin.register(UserOTP)
class UserOTPAdmin(admin.ModelAdmin):
    list_display = ['user', 'created_at', 'expires_at', 'is_used', 'attempts']
    list_filter = ['is_used', 'created_at']
    search_fields = ['user__username', 'user__email']
    readonly_fields = ['otp_hash', 'created_at']
    ordering = ['-created_at']

@admin.register(Inspection)
class InspectionAdmin(admin.ModelAdmin):
    list_display = ['inspector', 'inspection_number', 'facility_client_name', 'inspection_date', 'town', 'commodity', 'inspected', 'sampled']
    list_filter = [
        'inspector', 
        'inspection_date', 
        'town', 
        'commodity', 
        'inspected', 
        'sampled',
        'lab_used',
        'created_at'
    ]
    search_fields = ['inspector', 'facility_client_name', 'town', 'product_name', 'comments']
    ordering = ['-inspection_date', '-inspection_number']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Inspector Information', {
            'fields': ('inspector', 'inspection_number')
        }),
        ('Inspection Details', {
            'fields': ('inspection_date', 'facility_client_name', 'town')
        }),
        ('Product Information', {
            'fields': ('commodity', 'product_name', 'product_class')
        }),
        ('Inspection Activities', {
            'fields': ('inspected', 'sampled', 'normal_hours', 'kilometres_traveled')
        }),
        ('Testing Parameters', {
            'fields': ('fat', 'protein', 'calcium', 'dna'),
            'classes': ('collapse',)
        }),
        ('Sample and Lab', {
            'fields': ('bought_sample_amount', 'lab_used'),
            'classes': ('collapse',)
        }),
        ('Documentation', {
            'fields': ('follow_up', 'occurrence_report', 'dispensation_application'),
            'classes': ('collapse',)
        }),
        ('Comments', {
            'fields': ('comments',)
        }),
        ('References', {
            'fields': ('rfi_reference_number', 'invoice_reference_number', 'lab_result_reference_number'),
            'classes': ('collapse',)
        }),
        ('Re-testing', {
            'fields': ('re_test', 're_test_reference_number'),
            'classes': ('collapse',)
        }),
        ('Compliance', {
            'fields': ('verification_external_testing', 'compliance_document', 'direction_expiry_date'),
            'classes': ('collapse',)
        }),
        ('Contact Information', {
            'fields': ('email', 'additional_email_1', 'additional_email_2', 'additional_email_3', 'additional_email_4'),
            'classes': ('collapse',)
        }),
        ('Communication', {
            'fields': ('was_mail_sent', 'compiled_supporting_documents'),
            'classes': ('collapse',)
        }),
        ('System Information', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('client')


# ── Weekly report email automations ───────────────────────────────────────
from .models import EmailAutomation, WeeklyEmailRecipient, WeeklyEmailLog  # noqa: E402


class WeeklyEmailRecipientInline(admin.TabularInline):
    model = WeeklyEmailRecipient
    extra = 1
    fields = ('email', 'name', 'active')


@admin.register(EmailAutomation)
class EmailAutomationAdmin(admin.ModelAdmin):
    list_display = ('name', 'enabled', 'report_type', 'per_inspector',
                    'schedule_type', 'send_day_of_week', 'send_hour')
    list_filter = ('enabled', 'report_type', 'schedule_type')
    search_fields = ('name', 'subject')
    inlines = [WeeklyEmailRecipientInline]


@admin.register(WeeklyEmailLog)
class WeeklyEmailLogAdmin(admin.ModelAdmin):
    list_display = ('run_at', 'automation_name', 'status', 'week_start', 'week_end', 'triggered_by')
    list_filter = ('status', 'triggered_by')
    search_fields = ('automation_name', 'recipients', 'error')
    readonly_fields = tuple(f.name for f in WeeklyEmailLog._meta.fields)
