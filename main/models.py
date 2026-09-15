from django.contrib.auth.models import AbstractUser
from django.db import models
from django.contrib.auth.models import User
from django.core.cache import cache
from django.conf import settings
from datetime import date
import re
from django.utils import timezone

# Add role field to existing User model
User.add_to_class('role', models.CharField(
    max_length=20,
    choices=[
        ('inspector', 'Inspector'),
        ('inspector_manager', 'Inspector Manager'),
        ('admin', 'Admin'),
        ('super_admin', 'Super Admin'),
        ('lab_technician', 'Lab Technician'),
        ('developer', 'Developer'),
    ],
    default='inspector',
    help_text="User role in the system"
))

User.add_to_class('phone_number', models.CharField(max_length=20, blank=True, null=True))
User.add_to_class('department', models.CharField(max_length=100, blank=True, null=True))
User.add_to_class('employee_id', models.CharField(max_length=50, blank=True, null=True, unique=True))

# Add properties to User model
@property
def is_inspector(self):
    return getattr(self, 'role', 'inspector') == 'inspector'

@property
def is_admin(self):
    return getattr(self, 'role', 'inspector') == 'admin'

@property
def is_super_admin(self):
    return getattr(self, 'role', 'inspector') == 'super_admin'

@property
def is_lab_technician(self):
    return getattr(self, 'role', 'inspector') == 'lab_technician'

@property
def is_developer(self):
    return getattr(self, 'role', 'inspector') == 'developer'

@property
def is_inspector_manager(self):
    return getattr(self, 'role', 'inspector') == 'inspector_manager'

def get_managed_inspector_ids(self):
    """Return list of server inspector_ids for inspectors this manager manages (via InspectorMapping name lookup)."""
    if getattr(self, 'role', None) != 'inspector_manager':
        return []
    names = get_managed_inspector_names(self)
    ids = []
    for name in names:
        try:
            mapping = InspectorMapping.objects.get(inspector_name=name)
            ids.append(mapping.inspector_id)
        except InspectorMapping.DoesNotExist:
            pass
    return ids

def get_managed_inspector_names(self):
    """Return list of inspector full names that this inspector_manager manages."""
    if getattr(self, 'role', None) != 'inspector_manager':
        return []
    inspectors = (
        InspectorManagerAllocation.objects.filter(manager=self)
        .select_related('inspector')
        .values_list('inspector__first_name', 'inspector__last_name', 'inspector__username')
    )
    names = []
    for first, last, username in inspectors:
        full_name = f"{first} {last}".strip() if (first or last) else username
        if full_name:
            names.append(full_name)
    return names

def has_role_permission(self, required_role):
    """Check if user has the required role or higher"""
    role_hierarchy = {
        'inspector': 1,
        'inspector_manager': 2,
        'admin': 3,
        'lab_technician': 4,
        'super_admin': 5,
        'developer': 6,
    }

    user_level = role_hierarchy.get(getattr(self, 'role', 'inspector'), 0)
    required_level = role_hierarchy.get(required_role, 0)

    return user_level >= required_level

User.add_to_class('is_inspector', is_inspector)
User.add_to_class('is_admin', is_admin)
User.add_to_class('is_super_admin', is_super_admin)
User.add_to_class('is_lab_technician', is_lab_technician)
User.add_to_class('is_developer', is_developer)
User.add_to_class('is_inspector_manager', is_inspector_manager)
User.add_to_class('get_managed_inspector_ids', get_managed_inspector_ids)
User.add_to_class('get_managed_inspector_names', get_managed_inspector_names)
User.add_to_class('has_role_permission', has_role_permission)


class UserOTP(models.Model):
    """Stores hashed OTP codes for user account setup and admin-triggered resets."""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='otp_codes',
    )
    otp_hash = models.CharField(max_length=128, help_text="Hashed 6-digit OTP code")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text="OTP expiration timestamp")
    is_used = models.BooleanField(default=False)
    attempts = models.IntegerField(default=0, help_text="Failed verification attempts")

    MAX_ATTEMPTS = 5

    class Meta:
        db_table = 'user_otp'
        ordering = ['-created_at']
        verbose_name = 'User OTP'
        verbose_name_plural = 'User OTPs'
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f"OTP for {self.user.username} (expires {self.expires_at})"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    @property
    def is_locked(self):
        return self.attempts >= self.MAX_ATTEMPTS

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired and not self.is_locked


class ClientManager(models.Manager):
    def get_next_client_id(self):
        """Generate next sequential client ID (CL00001, CL00002, etc.)"""
        # Find the highest valid client_id that follows the CLxxxxx format
        clients_with_valid_ids = self.filter(client_id__startswith='CL').exclude(client_id__isnull=True)
        max_id = 0
        for client in clients_with_valid_ids:
            try:
                # Extract the numeric part after "CL"
                numeric_part = client.client_id[2:]
                if numeric_part.isdigit():
                    client_num = int(numeric_part)
                    if client_num > max_id:
                        max_id = client_num
            except (ValueError, IndexError):
                # Skip clients with invalid client_id format
                continue
        return f"CL{(max_id + 1):05d}"

class InspectorMapping(models.Model):
    """Model to store inspector ID mappings for the server"""
    inspector_id = models.IntegerField(unique=True, help_text="Server inspector ID (e.g., 1234567)")
    inspector_name = models.CharField(max_length=100, help_text="Human-readable inspector name (e.g., Ethan)")
    is_active = models.BooleanField(default=True, help_text="Whether this inspector is active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'inspector_mappings'
        ordering = ['inspector_name']
        verbose_name = "Inspector Mapping"
        verbose_name_plural = "Inspector Mappings"
        indexes = [
            models.Index(fields=['inspector_id']),
            models.Index(fields=['inspector_name']),
        ]
    
    def __str__(self):
        return f"{self.inspector_name} (ID: {self.inspector_id})"


class InspectorManagerAllocation(models.Model):
    """Maps inspector managers to the inspector users they manage."""
    manager = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='managed_inspectors',
    )
    inspector = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='inspector_managers',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inspector_manager_allocations'
        unique_together = [['manager', 'inspector']]

    def __str__(self):
        inspector_name = self.inspector.get_full_name() or self.inspector.username
        return f"{self.manager.get_full_name()} manages {inspector_name}"


class SystemSettings(models.Model):
    """System settings for automatic synchronization and preferences.

    NOTE: Background sync is ALWAYS ENABLED to prevent missing inspection data.
    The sync enable/disable fields below are kept for compatibility but are ignored.
    """

    # Auto Sync Settings (ALWAYS ENABLED - field kept for compatibility only)
    auto_sync_enabled = models.BooleanField(default=True, verbose_name="Enable Auto Sync",
                                           help_text="Background sync is ALWAYS enabled to prevent data loss")
    backup_frequency_days = models.IntegerField(default=7, verbose_name="Backup Frequency (days)")
    session_timeout_minutes = models.IntegerField(default=30, verbose_name="Session Timeout (minutes)")

    # Data Sync Settings (ALWAYS runs automatically in background)
    google_sheets_enabled = models.BooleanField(default=True, verbose_name="Google Sheets Integration",
                                               help_text="Always syncs - field kept for compatibility")
    sql_server_enabled = models.BooleanField(default=True, verbose_name="SQL Server Integration",
                                            help_text="Always syncs - field kept for compatibility")
    sync_interval_hours = models.FloatField(default=1.0, verbose_name="Sync Interval (hours)")
    
    # Compliance Documents Settings
    compliance_sync_enabled = models.BooleanField(default=True, verbose_name="Enable Automatic Compliance Sync")
    compliance_sync_interval_hours = models.IntegerField(default=24, verbose_name="Compliance Sync Interval (hours)")
    compliance_processing_mode = models.CharField(
        max_length=20,
        default='incremental',
        choices=[
            ('all_at_once', 'Process ALL at Once'),
            ('incremental', 'Incremental Processing'),
            ('manual', 'Manual Processing Only')
        ],
        verbose_name="Processing Mode"
    )
    
    # Performance Optimization Settings
    compliance_daily_sync_enabled = models.BooleanField(default=True, verbose_name="Enable Daily Compliance Sync")
    compliance_last_processed_date = models.DateTimeField(null=True, blank=True, verbose_name="Last Compliance Process Date")
    compliance_skip_processed = models.BooleanField(default=True, verbose_name="Skip Already Processed Documents")
    
    # Priority Refresh Settings
    priority_1_interval = models.IntegerField(default=1, verbose_name="First 2 Months Refresh Interval")
    priority_1_unit = models.CharField(max_length=10, default='hours', verbose_name="First 2 Months Unit")
    priority_2_interval = models.IntegerField(default=2, verbose_name="Last 2 Months Refresh Interval")
    priority_2_unit = models.CharField(max_length=10, default='hours', verbose_name="Last 2 Months Unit")
    
    # OneDrive Settings
    onedrive_enabled = models.BooleanField(default=True, verbose_name="OneDrive Integration")
    onedrive_local_caching = models.BooleanField(default=True, verbose_name="Enable Local File Caching")
    onedrive_cache_days = models.IntegerField(default=60, verbose_name="Cache Duration (Days)")
    onedrive_auto_sync = models.BooleanField(default=True, verbose_name="Enable Auto Sync")
    onedrive_sync_interval_hours = models.IntegerField(default=2, verbose_name="Sync Interval (Hours)")
    onedrive_upload_delay_days = models.IntegerField(default=3, verbose_name="Upload Delay (Days)")
    onedrive_upload_delay_unit = models.CharField(
        max_length=10,
        default='days',
        choices=[
            ('hours', 'Hours'),
            ('days', 'Days'),
            ('weeks', 'Weeks'),
            ('months', 'Months'),
            ('years', 'Years')
        ],
        verbose_name="Upload Delay Unit"
    )
    
    # Theme Settings
    theme_mode = models.CharField(
        max_length=10,
        default='light',
        choices=[
            ('light', 'Light Mode'),
            ('dark', 'Dark Mode'),
            ('auto', 'Auto')
        ],
        verbose_name="Theme Mode"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "System Setting"
        verbose_name_plural = "System Settings"
    
    def __str__(self):
        return f"System Settings (Updated: {self.updated_at.strftime('%Y-%m-%d %H:%M')})"
    
    def save(self, *args, **kwargs):
        # Ensure only one system settings record exists
        if not self.pk:
            SystemSettings.objects.all().delete()
        super().save(*args, **kwargs)
    
    @classmethod
    def get_settings(cls):
        """Get or create system settings."""
        settings, created = cls.objects.get_or_create(pk=1)
        return settings


class Client(models.Model):
    """General clients table"""
    APPROVAL_STATUS_CHOICES = [
        ('approved', 'Approved'),
        ('pending', 'Pending Approval'),
    ]

    client_id = models.CharField(max_length=200, unique=True, db_index=True)
    name = models.CharField(max_length=200, db_index=True, verbose_name="Client Name")
    internal_account_code = models.CharField(max_length=100, blank=True, null=True, verbose_name="Internal Account Code", help_text="From Google Sheets Column H")
    email = models.EmailField(blank=True, null=True, verbose_name="Client Email", help_text="From Google Sheets Column K")
    manual_email = models.EmailField(blank=True, null=True, verbose_name="Manual Email Override", help_text="Manually added email that persists across syncs")
    town = models.CharField(max_length=100, blank=True, null=True, verbose_name="Town/Location")
    corporate_group = models.CharField(max_length=200, blank=True, null=True, verbose_name="Corporate Group", help_text="e.g., Pick n Pay - Franchise")
    group_type = models.CharField(max_length=100, blank=True, null=True, verbose_name="Group Type", help_text="e.g., Corporate Store, Franchise Store")
    facility_type = models.CharField(max_length=100, blank=True, null=True, verbose_name="Facility Type", help_text="e.g., Retailer, Butchery, Re-Packer")
    approval_status = models.CharField(
        max_length=20, choices=APPROVAL_STATUS_CHOICES, default='approved', db_index=True,
        verbose_name="Approval Status",
        help_text="Clients auto-created by field inspectors start as 'pending' until back-office approves the name",
    )
    created_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='clients_created',
        help_text="User whose inspection capture auto-created this client",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ClientManager()

    class Meta:
        db_table = 'food_safety_agency_clients'
        ordering = ['name']
        verbose_name = "Client"
        verbose_name_plural = "Clients"
        indexes = [
            models.Index(fields=['client_id']),
            models.Index(fields=['name']),
            models.Index(fields=['internal_account_code']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.client_id})"
    
    def save(self, *args, **kwargs):
        if not self.client_id:
            self.client_id = Client.objects.get_next_client_id()
        super().save(*args, **kwargs)


class ClientApprovalLog(models.Model):
    """Audit trail of Clients Approval decisions.

    One row per decision on an auto-created client: either it was accepted as a
    genuinely new client, or it was merged into the existing client it
    duplicated. Powers the "which inspectors capture incorrect clients" report
    (the pending Client row itself is deleted on merge, so this log is the only
    surviving record of the mistake).
    """
    OUTCOME_CHOICES = [
        ('accepted', 'Accepted as new client'),
        ('merged', 'Matched to existing client'),
    ]

    typed_name = models.CharField(max_length=200, help_text="Client name exactly as the inspector captured it")
    final_name = models.CharField(max_length=200, help_text="Client name after the decision (target client's name for merges)")
    outcome = models.CharField(max_length=20, choices=OUTCOME_CHOICES, db_index=True)
    inspector = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='client_approval_entries', help_text="User whose capture created the client",
    )
    inspector_name = models.CharField(max_length=150, blank=True, default='')
    decided_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='client_approval_decisions',
    )
    decided_by_name = models.CharField(max_length=150, blank=True, default='')
    target_client = models.ForeignKey(
        'Client', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approval_merges', help_text="Existing client the entry was merged into (merges only)",
    )
    inspection_count = models.IntegerField(default=0, help_text="Inspections attached at decision time")
    client_created_at = models.DateTimeField(null=True, blank=True, help_text="When the inspector created the client")
    decided_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'client_approval_log'
        ordering = ['-decided_at']
        verbose_name = "Client Approval Log Entry"
        verbose_name_plural = "Client Approval Log"

    def __str__(self):
        return f"{self.typed_name} -> {self.final_name} ({self.outcome})"


class ClientEmail(models.Model):
    """Additional emails linked to a client (persists across syncs)."""
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='additional_emails')
    email = models.EmailField()
    label = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'food_safety_agency_client_emails'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['client']),
        ]

    def __str__(self):
        return f"{self.email} -> {self.client.client_id}"


class CorporateGroupEmail(models.Model):
    """Email addresses associated with a corporate group for invoice sending."""
    corporate_group = models.CharField(max_length=200, db_index=True)
    email = models.EmailField()
    label = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'corporate_group_emails'
        ordering = ['corporate_group', 'email']
        unique_together = [['corporate_group', 'email']]

    def __str__(self):
        return f"{self.email} ({self.corporate_group})"


class Inspection(models.Model):
    """Inspection data model based on the provided structure"""
    
    # Inspector information
    inspector = models.CharField(max_length=100, help_text="Inspector name (e.g., Cinga Ngongo)")
    inspection_number = models.PositiveIntegerField(help_text="Sequential inspection number")
    
    # Basic inspection details
    inspection_date = models.DateField(help_text="Date of inspection")
    facility_client_name = models.CharField(max_length=200, help_text="Facility or client name")
    town = models.CharField(max_length=100, blank=True, null=True, help_text="Town/location")
    
    # Product information
    commodity = models.CharField(max_length=50, blank=True, null=True, help_text="Commodity type (e.g., RAW)")
    product_name = models.CharField(max_length=100, blank=True, null=True, help_text="Product name (e.g., Mince, Mildwors)")
    product_class = models.CharField(max_length=100, blank=True, null=True, help_text="Product class (e.g., Raw species sausage / wors)")
    
    # Inspection activities
    inspected = models.BooleanField(default=False, help_text="Was inspection conducted?")
    sampled = models.BooleanField(default=False, help_text="Was sampling conducted?")
    
    # Operational details
    normal_hours = models.DecimalField(max_digits=4, decimal_places=1, blank=True, null=True, help_text="Normal hours worked")
    kilometres_traveled = models.DecimalField(max_digits=6, decimal_places=1, blank=True, null=True, help_text="Kilometres traveled")
    
    # Testing parameters
    fat = models.BooleanField(default=False, help_text="Fat testing required")
    protein = models.BooleanField(default=False, help_text="Protein testing required")
    calcium = models.BooleanField(default=False, help_text="Calcium testing required")
    dna = models.BooleanField(default=False, help_text="DNA testing required")
    
    # Sample and lab information
    bought_sample_amount = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True, help_text="Amount paid for sample")
    lab_used = models.CharField(max_length=100, blank=True, null=True, help_text="Laboratory used (e.g., Food Safety Laboratory)")
    
    # Documentation and follow-up
    follow_up = models.BooleanField(default=False, help_text="Follow-up required")
    occurrence_report = models.BooleanField(default=False, help_text="Accurance report required")
    dispensation_application = models.BooleanField(default=False, help_text="Dispensation application required")
    
    # Comments and notes
    comments = models.TextField(blank=True, null=True, help_text="Additional comments or notes")
    
    # File uploads and references
    uploaded = models.BooleanField(default=False, help_text="Files uploaded")
    rfi_reference_number = models.CharField(max_length=100, blank=True, null=True, help_text="RFI reference number")
    invoice_reference_number = models.CharField(max_length=100, blank=True, null=True, help_text="Invoice reference number")
    lab_result_reference_number = models.CharField(max_length=100, blank=True, null=True, help_text="Lab result reference number")
    
    # Re-testing information
    re_test = models.BooleanField(default=False, help_text="Re-test required")
    re_test_reference_number = models.CharField(max_length=100, blank=True, null=True, help_text="Re-test reference number")
    
    # External testing and compliance
    verification_external_testing = models.BooleanField(default=False, help_text="External testing verification required")
    compliance_document = models.BooleanField(default=False, help_text="Compliance document required")
    direction_expiry_date = models.DateField(blank=True, null=True, help_text="Direction expiry date")
    
    # Contact information
    email = models.EmailField(blank=True, null=True, help_text="Primary email contact")
    additional_email_1 = models.EmailField(blank=True, null=True, help_text="Additional email contact 1")
    additional_email_2 = models.EmailField(blank=True, null=True, help_text="Additional email contact 2")
    additional_email_3 = models.EmailField(blank=True, null=True, help_text="Additional email contact 3")
    additional_email_4 = models.EmailField(blank=True, null=True, help_text="Additional email contact 4")
    
    # Communication tracking
    was_mail_sent = models.BooleanField(default=False, help_text="Was email sent?")
    compiled_supporting_documents = models.BooleanField(default=False, help_text="Supporting documents compiled")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'inspections'
        ordering = ['-inspection_date', '-inspection_number']
        verbose_name = "Inspection"
        verbose_name_plural = "Inspections"
    
    def __str__(self):
        return f"{self.inspector} - {self.facility_client_name} - {self.inspection_date}"


class InspectionGroup(models.Model):
    """
    Parent group for multi-commodity inspections.

    One group can have multiple inspections (commodities) that all share common fields:
    - Same client, date, inspector, location
    - Same km_traveled, hours, additional_email
    - Each inspection (child) has its own commodity, product, samples, etc.

    This replaces the internal_account_code system and provides proper parent-child relationships.
    """

    # Link to client
    client = models.ForeignKey('Client', on_delete=models.SET_NULL, blank=True, null=True, related_name='inspection_groups')

    # Common fields shared by all inspections in this group
    client_name = models.CharField(max_length=200, help_text="Client name")
    date_of_inspection = models.DateField(help_text="Date of inspection")
    inspector_name = models.CharField(max_length=100, blank=True, null=True, help_text="Inspector name")
    town = models.CharField(max_length=100, blank=True, null=True, help_text="Town/location")

    # Classification fields
    facility_type = models.CharField(max_length=100, blank=True, null=True, help_text="Facility type")
    group_type = models.CharField(max_length=100, blank=True, null=True, help_text="Group type")
    corporate_group = models.CharField(max_length=100, blank=True, null=True, help_text="Corporate group")

    # Shared metadata
    additional_email = models.EmailField(blank=True, null=True, help_text="Additional email for this group")
    comment = models.TextField(blank=True, null=True, help_text="Comment for this group")
    km_traveled = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True, help_text="Kilometers traveled")
    hours = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True, help_text="Hours worked")
    travel_start_time = models.TimeField(blank=True, null=True, help_text="Travel start time")
    travel_end_time = models.TimeField(blank=True, null=True, help_text="Travel end time")

    # Flags
    is_manual = models.BooleanField(default=True, help_text="Manually created (vs synced from server)")

    # Who captured this group in APS (null for rows created before tracking / server syncs)
    created_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, blank=True, null=True,
        related_name='created_inspection_groups',
        help_text="User who captured this inspection group in APS",
    )
    created_by_name = models.CharField(
        max_length=150, blank=True, default='',
        help_text="Name of the user who captured this group (persists after user deletion)",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inspection_groups'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client_name', 'date_of_inspection'], name='idx_group_client_date'),
            models.Index(fields=['created_at'], name='idx_group_created'),
            models.Index(fields=['client_name', 'date_of_inspection', 'inspector_name'], name='idx_group_dup_check'),
        ]

    def __str__(self):
        return f"{self.client_name} - {self.date_of_inspection} (Group #{self.id})"


class FoodSafetyAgencyInspection(models.Model):
    """Food Safety Agency Inspection data copied from remote SQL Server"""

    # PARENT GROUP - New parent-child relationship
    inspection_group = models.ForeignKey(
        'InspectionGroup',
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name='inspections',
        help_text="Parent group that this inspection belongs to"
    )
    
    # Basic inspection details
    commodity = models.CharField(max_length=50, blank=True, null=True, help_text="Commodity type (e.g., POULTRY, RAW, PMP, EGGS)")
    date_of_inspection = models.DateField(blank=True, null=True, help_text="Date of inspection")
    start_of_inspection = models.TimeField(blank=True, null=True, help_text="Start time of inspection")
    end_of_inspection = models.TimeField(blank=True, null=True, help_text="End time of inspection")
    
    # Location and inspection details
    inspection_location_type_id = models.IntegerField(blank=True, null=True, help_text="Inspection location type ID")
    is_direction_present_for_this_inspection = models.BooleanField(default=False, help_text="Direction present for this inspection")
    is_product_compliant = models.BooleanField(null=True, default=None, help_text="Product compliance status — NULL = not yet assessed, True = compliant, False = non-compliant")
    inspector_id = models.IntegerField(blank=True, null=True, help_text="Inspector ID from remote system")
    inspector_name = models.CharField(max_length=100, blank=True, null=True, help_text="Human-readable inspector name")
    
    # GPS coordinates
    latitude = models.CharField(max_length=20, blank=True, null=True, help_text="GPS Latitude")
    longitude = models.CharField(max_length=20, blank=True, null=True, help_text="GPS Longitude")
    
    # Product details (manual entry)
    product_name = models.CharField(max_length=150, blank=True, null=True, help_text="Product name (e.g., Mince, Burger, Boerewors)")
    product_class = models.CharField(max_length=150, blank=True, null=True, help_text="Product class/category")

    # Sample and travel information
    is_sample_taken = models.BooleanField(blank=True, null=True, help_text="Was sample taken during inspection")
    bought_sample = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True, help_text="Value of bought sample in Rand (ZAR)")
    inspection_travel_distance_km = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True, help_text="Travel distance in kilometers")
    
    # New fields for manual entry
    km_traveled = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True, help_text="Manual entry of kilometers traveled")
    hours = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True, help_text="Manual entry of hours worked")
    additional_email = models.CharField(max_length=500, blank=True, null=True, help_text="Additional email(s) for this specific inspection group - can be comma-separated")
    approved_status = models.CharField(max_length=10, blank=True, null=True, help_text="Approval status for this inspection group",
                                     choices=[
                                         ('PENDING', 'Pending'),
                                         ('APPROVED', 'Approved')
                                     ], default='PENDING')
    approved_date = models.DateTimeField(blank=True, null=True, help_text="When this inspection was approved")
    approved_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, blank=True, null=True, related_name='approved_inspections', help_text="Who approved this inspection")
    comment = models.TextField(blank=True, null=True, help_text="Comment for this inspection group")
    lab = models.CharField(max_length=20, blank=True, null=True, help_text="Laboratory used for testing",
                          choices=[
                              ('lab_a', 'Food Safety Laboratory'),
                              ('lab_b', 'Merieux NutriSciences'),
                              ('lab_c', 'AGRI Food Laboratory (SGS)'),
                              ('lab_d', 'SANBI'),
                              ('lab_e', 'SMT'),
                              ('lab_f', 'ARC')
                          ])
    
    # Reference information
    remote_id = models.IntegerField(blank=True, null=True, help_text="Original ID from remote system")
    client_name = models.CharField(max_length=200, blank=True, null=True, help_text="Client name (updated from Google Sheets if match found)")
    client = models.ForeignKey('Client', on_delete=models.SET_NULL, blank=True, null=True, related_name='inspections', help_text="Link to Client record for file storage")
    internal_account_code = models.CharField(max_length=100, blank=True, null=True, db_index=True, help_text="Internal Account Code from SQL Server (used to match with Google Sheets)")
    inspection_sequence = models.IntegerField(default=1, help_text="Sequence number for this inspection within its group (1, 2, 3, etc.)")
    town = models.CharField(max_length=100, blank=True, null=True, help_text="Town/location of inspection")

    # Inspection activities
    inspected = models.BooleanField(default=False, help_text="Was inspection conducted?")

    # Documentation and follow-up
    follow_up = models.BooleanField(default=False, help_text="Follow-up required")
    occurrence_report = models.BooleanField(default=False, help_text="Occurrence report required")
    dispensation_application = models.BooleanField(default=False, help_text="Dispensation application required")

    # Testing parameters
    fat = models.BooleanField(default=False, help_text="Fat testing required")
    protein = models.BooleanField(default=False, help_text="Protein testing required")
    calcium = models.BooleanField(default=False, help_text="Calcium testing required")
    dna = models.BooleanField(default=False, help_text="DNA testing required")
    # Per-test COA/Lab outcome, captured when the COA/Lab result is uploaded.
    # {"fat": "compliant", "protein": "non-compliant"} — a test that was not
    # assessed is simply absent, which is why this is a dict and not four more
    # boolean columns. The booleans above say a test was REQUIRED; this says
    # how it came back.
    lab_test_results = models.JSONField(
        default=dict, blank=True,
        help_text="Per-test COA/Lab outcome, e.g. {'fat': 'compliant', 'dna': 'non-compliant'}",
    )
    needs_retest = models.CharField(max_length=3, blank=True, null=True, verbose_name='Needs Retest',
                                  choices=[('YES', 'Yes'), ('NO', 'No')], help_text="Whether this inspection needs retesting")
    
    # Document status tracking
    is_sent = models.BooleanField(default=False, help_text="Whether documents have been sent to client")
    sent_date = models.DateTimeField(blank=True, null=True, help_text="Date when documents were sent")
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='sent_inspections', help_text="User who marked documents as sent")
    sent_by_name = models.CharField(max_length=150, blank=True, default='', help_text="Name of user who sent documents (persists after user deletion)")
    
    # OneDrive upload tracking
    onedrive_uploaded = models.BooleanField(default=False, help_text="Whether files have been uploaded to OneDrive")
    onedrive_upload_date = models.DateTimeField(blank=True, null=True, help_text="Date when files were uploaded to OneDrive")
    onedrive_folder_id = models.CharField(max_length=255, blank=True, null=True, help_text="OneDrive folder ID where files are stored")
    
    # Document upload tracking
    rfi_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='rfi_uploads', help_text="User who uploaded RFI document")
    rfi_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when RFI was uploaded")
    invoice_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='invoice_uploads', help_text="User who uploaded Invoice document")
    invoice_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when Invoice was uploaded")
    coa_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='coa_uploads', help_text="User who uploaded COA document")
    coa_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when COA document was uploaded")
    lab_form_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='lab_form_uploads', help_text="User who uploaded Lab Form document")
    lab_form_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when Lab Form document was uploaded")
    retest_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='retest_uploads', help_text="User who uploaded Retest document")
    retest_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when Retest document was uploaded")
    occurrence_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='occurrence_uploads', help_text="User who uploaded Accurance document")
    occurrence_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when Accurance document was uploaded")
    composition_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='composition_uploads', help_text="User who uploaded Composition document")
    composition_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when Composition document was uploaded")
    other_uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='other_uploads', help_text="User who uploaded Other document")
    other_uploaded_date = models.DateTimeField(blank=True, null=True, help_text="Date when Other document was uploaded")

    # Invoice number (editable field for tracking invoiced items)
    invoice_number = models.CharField(max_length=100, blank=True, null=True, help_text="Invoice number assigned to this inspection")

    # Manual entry flag - prevents sync from overwriting this inspection
    is_manual = models.BooleanField(default=True, help_text="True if this inspection was manually entered (not synced from SQL Server)")

    # New classification fields for manual inspections
    corporate_group = models.CharField(max_length=200, blank=True, null=True, help_text="Corporate group (e.g., Pick n Pay, Checkers, Spar)")
    group_type = models.CharField(max_length=100, blank=True, null=True, help_text="Group type (Corporate Store, Franchise Store, Individual)")
    facility_type = models.CharField(max_length=100, blank=True, null=True, help_text="Facility type (Retailer, Butchery, Re-Packer, etc.)")

    # Occurrence Report specific fields
    is_occurrence_report = models.BooleanField(default=False, help_text="True if this is an occurrence report (not a regular inspection)")
    registration_code = models.CharField(max_length=100, blank=True, null=True, help_text="Registration code (can include dashes, e.g., ABC-123-456)")
    physical_address = models.TextField(blank=True, null=True, help_text="Physical address of the facility")
    telephone = models.CharField(max_length=50, blank=True, null=True, help_text="Telephone number")
    time_of_visit = models.TimeField(blank=True, null=True, help_text="Time of visit for occurrence report")
    occurrence_findings = models.JSONField(blank=True, null=True, help_text="List of findings from occurrence report")
    occurrence_description = models.TextField(blank=True, null=True, help_text="Description of events for occurrence report")
    occurrence_inspector_name = models.CharField(max_length=200, blank=True, null=True, help_text="Auditor/Inspector name for occurrence report")
    occurrence_inspector_date = models.DateField(blank=True, null=True, help_text="Inspector signature date")
    occurrence_inspector_signature = models.TextField(blank=True, null=True, help_text="Inspector signature (base64 encoded image)")
    occurrence_manager_name = models.CharField(max_length=200, blank=True, null=True, help_text="Manager/Owner name for occurrence report")
    occurrence_manager_date = models.DateField(blank=True, null=True, help_text="Manager signature date")
    occurrence_manager_signature = models.TextField(blank=True, null=True, help_text="Manager signature (base64 encoded image)")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'food_safety_agency_inspections'
        ordering = ['-date_of_inspection', '-created_at']
        verbose_name = "Food Safety Agency Inspection"
        verbose_name_plural = "Food Safety Agency Inspections"
        # IMPORTANT: Use composite key (commodity, remote_id) for uniqueness
        # This is a workaround for SQL Server database design issue where
        # each commodity table uses its own ID sequence, causing duplicate IDs
        unique_together = [['commodity', 'remote_id']]
        indexes = [
            models.Index(fields=['commodity']),
            models.Index(fields=['date_of_inspection']),
            models.Index(fields=['inspector_name']),
            models.Index(fields=['client_name']),
            models.Index(fields=['inspector_id']),
            models.Index(fields=['internal_account_code']),
            models.Index(fields=['commodity', 'remote_id']),  # Composite key index for performance
            models.Index(fields=['inspection_group']),  # Speed up grouping by inspection_group
            models.Index(fields=['inspection_group', 'date_of_inspection', 'client_name']),  # Composite index for shipment_list grouping query
            models.Index(fields=['is_sent']),  # Speed up sent/unsent filtering
        ]

    @property
    def unique_inspection_id(self):
        """
        Generate globally unique inspection ID combining commodity and remote_id.
        This is necessary because the SQL Server database reuses inspection IDs
        across different commodity tables (e.g., ID 8487 exists in both RAW and PMP tables).

        Returns:
            str: Formatted as 'COMMODITY-REMOTEID' (e.g., 'RAW-8487', 'PMP-8487')
        """
        if self.commodity and self.remote_id:
            return f"{self.commodity}-{self.remote_id}"
        return str(self.remote_id) if self.remote_id else "Unknown"

    def __str__(self):
        return f"[{self.unique_inspection_id}] {self.inspector_name} - {self.client_name} - {self.date_of_inspection}"

    @property
    def rfi_uploaded(self):
        """Check if RFI document has been uploaded"""
        return self.rfi_uploaded_date is not None

    @property
    def invoice_uploaded(self):
        """Check if Invoice document has been uploaded"""
        return self.invoice_uploaded_date is not None

    @property
    def occurrence_uploaded(self):
        """Check if Accurance document has been uploaded"""
        return self.occurrence_uploaded_date is not None

    @property
    def coa_uploaded(self):
        """Check if COA document has been uploaded"""
        return self.coa_uploaded_date is not None

    @property
    def lab_form_uploaded(self):
        """Check if Lab Form document has been uploaded"""
        return self.lab_form_uploaded_date is not None

    @property
    def retest_uploaded(self):
        """Check if Retest document has been uploaded"""
        return self.retest_uploaded_date is not None

    @property
    def composition_uploaded(self):
        """Check if Composition document has been uploaded"""
        return self.composition_uploaded_date is not None

    @property
    def other_uploaded(self):
        """Check if Other document has been uploaded"""
        return self.other_uploaded_date is not None

class Shipment(models.Model):
    """Shipment/Claim data model for legal system"""
    
    # Basic identification
    Claim_No = models.CharField(max_length=100, unique=True, verbose_name='Shipment Number')
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='shipments')
    client_reference = models.CharField(max_length=50, blank=True, null=True, verbose_name='Client Reference', 
                                     help_text='Auto-generated client-specific reference (e.g., ClientName-1-20250601)')
    
    # Claim details
    Brand = models.CharField(max_length=100, blank=True, null=True, verbose_name='Brand')
    Claimant = models.CharField(max_length=200, blank=True, null=True, verbose_name='Claimant Name')
    
    # Intent to claim
    Intent_To_Claim = models.CharField(max_length=3, blank=True, null=True, verbose_name='Intent To Claim',
                                     choices=[('YES', 'Yes'), ('NO', 'No')])
    Intend_Claim_Date = models.DateField(blank=True, null=True, verbose_name='Intent To Claim Date')
    
    # Formal claim
    Formal_Claim_Received = models.CharField(max_length=3, blank=True, null=True, verbose_name='Formal Claim',
                                          choices=[('YES', 'Yes'), ('NO', 'No')])
    Formal_Claim_Date_Received = models.DateField(blank=True, null=True, verbose_name='Formal Claim Date')
    
    # Financial information
    Claimed_Amount = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, verbose_name='Value')
    Amount_Paid_By_Carrier = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, verbose_name='Paid By Carrier')
    Amount_Paid_By_Awa = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, verbose_name='Paid By ISCM/AWA')
    Amount_Paid_By_Insurance = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, verbose_name='Paid By Insurance')
    Total_Savings = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, verbose_name='Total Savings')
    Financial_Exposure = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, verbose_name='Financial Exposure')
    
    # Status and settlement
    Settlement_Status = models.CharField(max_length=15, blank=True, null=True, verbose_name='Settled or Not Settled',
                                       choices=[('SETTLED', 'Settled'), ('NOT_SETTLED', 'Not Settled'), ('PARTIAL', 'Partially Settled')])
    Status = models.CharField(max_length=15, default='OPEN', verbose_name='Status',
                            choices=[('OPEN', 'Open'), ('PENDING', 'Pending'), ('CLOSED', 'Closed'), ('REJECTED', 'Rejected'), ('UNDER_REVIEW', 'Under Review')])
    Closed_Date = models.DateField(blank=True, null=True, verbose_name='Closed Date')
    
    # Branch information
    Branch = models.CharField(max_length=3, choices=[
        ('ATL', 'ATL'), ('CMU', 'CMU'), ('CON', 'CON'), ('DOR', 'DOR'), 
        ('HEC', 'HEC'), ('HNL', 'HNL'), ('HOU', 'HOU'), ('ICS', 'ICS'), 
        ('IMP', 'IMP'), ('JFK', 'JFK'), ('LCL', 'LCL'), ('ORD', 'ORD'), ('PPG', 'PPG')
    ])
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Shipment"
        verbose_name_plural = "Shipments"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['Claim_No']),
            models.Index(fields=['client']),
            models.Index(fields=['Status']),
            models.Index(fields=['Branch']),
            models.Index(fields=['client_reference']),
        ]
    
    def __str__(self):
        return f"{self.Claim_No} - {self.client.name if self.client else 'Unknown Client'}"
    
    def save(self, *args, **kwargs):
        # Generate client reference if not provided
        if not self.client_reference and self.client:
            # Get count of existing shipments for this client
            count = Shipment.objects.filter(client=self.client).count()
            # Format: ClientName-Count-Date
            date_str = self.created_at.strftime("%Y%m%d") if self.created_at else timezone.now().strftime("%Y%m%d")
            self.client_reference = f"{self.client.name.replace(' ', '')}-{count + 1}-{date_str}"
        
        super().save(*args, **kwargs)
    
    @property
    def is_closed(self):
        """Check if shipment is closed"""
        return self.Status == 'CLOSED'
    
    @property
    def total_paid(self):
        """Calculate total amount paid"""
        carrier = self.Amount_Paid_By_Carrier or 0
        awa = self.Amount_Paid_By_Awa or 0
        insurance = self.Amount_Paid_By_Insurance or 0
        return carrier + awa + insurance
    
    @property
    def net_exposure(self):
        """Calculate net financial exposure"""
        claimed = self.Claimed_Amount or 0
        total_paid = self.total_paid
        return claimed - total_paid

class Settings(models.Model):
    """Application settings model"""
    
    # System Settings
    auto_sync = models.BooleanField(default=False, help_text="Automatically sync data every 24 hours")
    backup_frequency = models.CharField(max_length=20, default='weekly', choices=[
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly')
    ], help_text="Backup frequency")
    # Idle timeout for a session. Field inspectors work across several devices
    # (phone + laptop) with long gaps between capturing an inspection and
    # uploading its documents, so a short idle window silently logs out the
    # device they aren't actively touching and their next upload 401s. A full
    # work-day idle window avoids that; SESSION_COOKIE_AGE (1 day) remains the
    # hard absolute cap on session lifetime.
    session_timeout = models.IntegerField(default=720, help_text="Session idle timeout in minutes (default 12h)")
    dark_mode = models.BooleanField(default=False, help_text="Enable dark mode theme")
    
    # Data Sync Settings
    google_sheets_enabled = models.BooleanField(default=True, help_text="Enable Google Sheets integration")
    sql_server_enabled = models.BooleanField(default=True, help_text="Enable SQL Server integration")
    sync_interval = models.IntegerField(default=24, help_text="Sync interval value")
    sync_interval_unit = models.CharField(max_length=10, default='hours', choices=[
        ('minutes', 'Minutes'),
        ('hours', 'Hours'),
        ('days', 'Days')
    ], help_text="Sync interval unit")
    
    # Notification Settings
    email_notifications = models.BooleanField(default=False, help_text="Enable email notifications")
    sync_notifications = models.BooleanField(default=True, help_text="Notify when data synchronization completes")
    notification_email = models.EmailField(blank=True, null=True, help_text="Email address for notifications")
    
    # Security Settings
    two_factor_auth = models.BooleanField(default=False, help_text="Enable two-factor authentication")
    password_expiry = models.IntegerField(default=90, help_text="Password expiry in days")
    max_login_attempts = models.IntegerField(default=5, help_text="Maximum login attempts")
    
    # Compliance Document Settings
    compliance_auto_sync = models.BooleanField(default=False, help_text="Enable automatic compliance document syncing")
    compliance_sync_interval = models.IntegerField(default=5, help_text="Compliance sync interval value")
    compliance_sync_unit = models.CharField(max_length=10, default='minutes', choices=[
        ('minutes', 'Minutes'),
        ('hours', 'Hours'),
        ('days', 'Days')
    ], help_text="Compliance sync interval unit")
    compliance_batch_mode = models.CharField(max_length=20, default='batch', choices=[
        ('batch', 'Process in Batches'),
        ('all', 'Process ALL at Once')
    ], help_text="Processing mode: batches or all documents at once")
    compliance_batch_size = models.IntegerField(default=50, help_text="Number of inspections to process per batch (only for batch mode)")
    compliance_date_range = models.IntegerField(default=7, help_text="Process inspections from last N days (only for batch mode)")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Settings"
        verbose_name_plural = "Settings"
    
    def __str__(self):
        return "Application Settings"
    
    @classmethod
    def get_settings(cls):
        """Get or create settings instance"""
        settings, created = cls.objects.get_or_create(pk=1)
        return settings

class SystemLog(models.Model):
    """System log to track user activities"""
    
    # User information
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='system_logs', verbose_name="User")
    
    # Activity details
    action = models.CharField(max_length=200, choices=[
        ('LOGIN', 'User Login'),
        ('LOGOUT', 'User Logout'),
        ('CREATE', 'Create Record'),
        ('UPDATE', 'Update Record'),
        ('DELETE', 'Delete Record'),
        ('VIEW', 'View Page'),
        ('NAVIGATE', 'Navigate'),
        ('SYNC', 'Data Sync'),
        ('SETTINGS', 'Settings Change'),
        ('USER_MANAGEMENT', 'User Management'),
        ('PASSWORD_RESET', 'Password Reset'),
        ('FILE_UPLOAD', 'File Upload'),
        ('EXPORT', 'Data Export'),
        ('IMPORT', 'Data Import'),
        ('SEARCH', 'Search'),
        ('FILTER', 'Filter'),
        ('ERROR', 'Error'),
        ('WARNING', 'Warning'),
        ('INFO', 'Information'),
    ], verbose_name="Action Type")
    
    # Page and object information
    page = models.CharField(max_length=100, blank=True, null=True, verbose_name="Page/URL")
    object_type = models.CharField(max_length=50, blank=True, null=True, verbose_name="Object Type")
    object_id = models.CharField(max_length=50, blank=True, null=True, verbose_name="Object ID")
    
    # Details and metadata
    description = models.TextField(blank=True, null=True, verbose_name="Description")
    details = models.JSONField(blank=True, null=True, verbose_name="Additional Details")
    ip_address = models.GenericIPAddressField(blank=True, null=True, verbose_name="IP Address")
    user_agent = models.TextField(blank=True, null=True, verbose_name="User Agent")
    
    # Timestamps
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Timestamp")
    
    class Meta:
        db_table = 'system_logs'
        ordering = ['-timestamp']
        verbose_name = "System Log"
        verbose_name_plural = "System Logs"
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['action']),
            models.Index(fields=['timestamp']),
            models.Index(fields=['page']),
            models.Index(fields=['object_type']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.action} - {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"
    
    @classmethod
    def log_activity(cls, user, action, page=None, object_type=None, object_id=None, 
                   description=None, details=None, ip_address=None, user_agent=None):
        """Convenience method to log user activity"""
        return cls.objects.create(
            user=user,
            action=action,
            page=page,
            object_type=object_type,
            object_id=object_id,
            description=description,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )


class Notification(models.Model):
    """Model to store system notifications for admins"""
    NOTIFICATION_TYPES = [
        ('error', 'Error'),
        ('warning', 'Warning'),
        ('info', 'Info'),
        ('success', 'Success'),
        ('sync', 'Sync Issue'),
        ('system', 'System Alert'),
    ]

    PRIORITY_LEVELS = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]

    # Basic fields
    title = models.CharField(max_length=255, help_text="Notification title")
    message = models.TextField(help_text="Notification message/description")
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES, default='info')
    priority = models.CharField(max_length=20, choices=PRIORITY_LEVELS, default='medium')

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    # Target user (null = all super admins)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')

    # Optional reference to related object
    related_object_type = models.CharField(max_length=100, null=True, blank=True)
    related_object_id = models.CharField(max_length=100, null=True, blank=True)

    # Optional action URL
    action_url = models.CharField(max_length=500, null=True, blank=True, help_text="URL to navigate when clicked")

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at', 'is_read']),
        ]

    def __str__(self):
        return f"{self.notification_type.upper()}: {self.title}"

    @classmethod
    def create_notification(cls, title, message, notification_type='info', priority='medium', user=None, action_url=None):
        """Helper method to create notifications"""
        return cls.objects.create(
            title=title,
            message=message,
            notification_type=notification_type,
            priority=priority,
            user=user,
            action_url=action_url
        )

    @classmethod
    def notify_super_admins(cls, title, message, notification_type='info', priority='medium', action_url=None):
        """Create notification for all super admins and developers"""
        from django.contrib.auth.models import User
        super_admins = User.objects.filter(role__in=['super_admin', 'developer'])

        notifications = []
        for admin in super_admins:
            notifications.append(cls(
                title=title,
                message=message,
                notification_type=notification_type,
                priority=priority,
                user=admin,
                action_url=action_url
            ))

        if notifications:
            cls.objects.bulk_create(notifications)
        return notifications


class ClientAllocation(models.Model):
    """
    Model to store client allocation data from Google Sheets
    This replicates the 'Internal Account Code Generator' sheet data
    """
    # Column A: Client ID (indexed for faster lookups)
    client_id = models.IntegerField(verbose_name="Client ID", db_index=True)

    # Column B: Facility Type (indexed for filtering)
    facility_type = models.CharField(max_length=100, blank=True, null=True, verbose_name="Facility Type", db_index=True)

    # Column C: Group Type (indexed for filtering)
    group_type = models.CharField(max_length=100, blank=True, null=True, verbose_name="Group Type", db_index=True)

    # Column D: Commodity (indexed for filtering)
    commodity = models.CharField(max_length=100, blank=True, null=True, verbose_name="Commodity", db_index=True)

    # Column E: Province
    province = models.CharField(max_length=100, blank=True, null=True, verbose_name="Province")

    # Column F: Corporate Group
    corporate_group = models.CharField(max_length=200, blank=True, null=True, verbose_name="Corporate Group")

    # Column G: Other
    other = models.CharField(max_length=200, blank=True, null=True, verbose_name="Other")

    # Column H: Internal Account Code
    internal_account_code = models.CharField(max_length=100, blank=True, null=True, verbose_name="Internal Account Code", db_index=True)

    # Column I: Allocated (checkbox - TRUE/FALSE)
    allocated = models.BooleanField(default=False, verbose_name="Allocated")

    # Column J: E-Click Name
    eclick_name = models.CharField(max_length=200, blank=True, null=True, verbose_name="E-Click Name")

    # Column K: Representative Email Address
    representative_email = models.EmailField(max_length=254, blank=True, null=True, verbose_name="Representative Email Address")

    # Column L: Phone Number
    phone_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="Phone Number")

    # Column M: Duplicates
    duplicates = models.CharField(max_length=200, blank=True, null=True, verbose_name="Duplicates")

    # Column N: Active/Deactive
    active_status = models.CharField(max_length=50, blank=True, null=True, verbose_name="Active/Deactive")

    # Metadata fields
    manually_added = models.BooleanField(default=False, verbose_name="Manually Added", help_text="True if added manually via UI, False if synced from sheets")
    last_synced = models.DateTimeField(auto_now=True, verbose_name="Last Synced")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")

    class Meta:
        db_table = 'client_allocation'
        ordering = ['client_id']
        verbose_name = "Client Allocation"
        verbose_name_plural = "Client Allocations"
        indexes = [
            # Single column indexes for common filters
            models.Index(fields=['client_id'], name='idx_client_id'),
            models.Index(fields=['internal_account_code'], name='idx_account_code'),
            models.Index(fields=['allocated'], name='idx_allocated'),
            models.Index(fields=['facility_type'], name='idx_facility_type'),
            models.Index(fields=['commodity'], name='idx_commodity'),
            # Composite indexes for common query patterns
            models.Index(fields=['facility_type', 'commodity'], name='idx_facility_commodity'),
            models.Index(fields=['allocated', 'facility_type'], name='idx_alloc_facility'),
            models.Index(fields=['last_synced'], name='idx_last_synced'),
            # Covering index for list view (most common query)
            models.Index(fields=['client_id', 'allocated', 'facility_type'], name='idx_list_view'),
        ]
        constraints = [
            # Ensure client_id is unique and positive
            models.CheckConstraint(condition=models.Q(client_id__gt=0), name='client_id_positive'),
        ]

    def __str__(self):
        return f"Client {self.client_id} - {self.internal_account_code or 'No Code'}"


class InspectionFee(models.Model):
    """Store inspection and testing fee rates"""
    fee_code = models.CharField(max_length=50, unique=True, help_text="Unique code for the fee (e.g., 'inspection_hour_rate')")
    fee_name = models.CharField(max_length=200, help_text="Display name for the fee")
    rate = models.DecimalField(max_digits=10, decimal_places=2, help_text="Current fee rate amount (always reflects latest rate)")
    description = models.TextField(blank=True, null=True, help_text="Description of the fee")
    last_updated = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'inspection_fees'
        ordering = ['fee_code']
        verbose_name = 'Inspection Fee'
        verbose_name_plural = 'Inspection Fees'

    def __str__(self):
        return f"{self.fee_name}: R{self.rate}"

    def get_rate_for_date(self, target_date):
        """
        Get the fee rate that was/is active on the target date.

        Args:
            target_date: A date or datetime object representing the date to query

        Returns:
            Decimal: The fee rate that was active on the target date.
                     Returns Decimal('0') if no history entry existed on or
                     before the requested date (i.e. fee was not yet defined).

        Example:
            # Get rate for a specific inspection date
            fee = InspectionFee.objects.get(fee_code='inspection_hour_rate')
            rate = fee.get_rate_for_date(inspection.date_of_inspection)
        """
        from decimal import Decimal as _Decimal

        # Convert datetime to date if necessary
        if hasattr(target_date, 'date'):
            target_date = target_date.date()

        # Find the most recent history entry where effective_date <= target_date
        history = self.history.filter(effective_date__lte=target_date).order_by('-effective_date').first()

        if history:
            return history.rate

        # No history existed on or before the target date — fee was not defined yet
        # If history exists at all (just not before this date), return 0.
        # If NO history exists at all, fall back to current rate (fees that have
        # never been versioned).
        if self.history.exists():
            return _Decimal('0')
        return self.rate


class InspectorTarget(models.Model):
    """Per-inspector quarterly targets for inspections and sampling."""
    inspector_name = models.CharField(max_length=100, unique=True, help_text="Inspector name matching inspection records")
    eggs = models.IntegerField(default=0)
    poultry = models.IntegerField(default=0)
    raw = models.IntegerField(default=0)
    pmp = models.IntegerField(default=0)
    raw_samples = models.IntegerField(default=0)
    pmp_samples = models.IntegerField(default=0)
    total_samples = models.IntegerField(default=0)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inspector_targets'
        ordering = ['inspector_name']

    def __str__(self):
        return f"Targets: {self.inspector_name}"


class QuarterlyTarget(models.Model):
    """Per-inspector, per-quarter adjustable targets."""
    QUARTER_CHOICES = [(1, 'Q1'), (2, 'Q2'), (3, 'Q3'), (4, 'Q4')]

    inspector_name = models.CharField(max_length=100)
    year = models.IntegerField()
    quarter = models.IntegerField(choices=QUARTER_CHOICES)
    eggs = models.IntegerField(default=0)
    poultry = models.IntegerField(default=0)
    raw = models.IntegerField(default=0)
    pmp = models.IntegerField(default=0)
    raw_samples = models.IntegerField(default=0)
    pmp_samples = models.IntegerField(default=0)
    total_samples = models.IntegerField(default=0)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    quarterly_revenue_target = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_vehicle_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    monthly_other_costs = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True, null=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'quarterly_targets'
        unique_together = [['inspector_name', 'year', 'quarter']]
        ordering = ['inspector_name', 'year', 'quarter']

    def __str__(self):
        return f"{self.inspector_name} - {self.year} Q{self.quarter}"


class FeeHistory(models.Model):
    """
    Track historical changes to fee rates with effective dates.
    When a fee is changed, a new history record is created instead of overwriting the old rate.
    This allows for accurate historical fee lookups based on inspection dates.
    """
    fee = models.ForeignKey('InspectionFee', on_delete=models.CASCADE, related_name='history')
    rate = models.DecimalField(max_digits=10, decimal_places=2, help_text="Historical fee rate")
    effective_date = models.DateField(help_text="Date when this rate becomes/became active")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, help_text="User who created this fee version")
    created_at = models.DateTimeField(auto_now_add=True, help_text="When this history record was created")
    notes = models.TextField(blank=True, null=True, help_text="Optional notes about why the fee was changed")

    class Meta:
        db_table = 'inspection_fee_history'
        ordering = ['-effective_date', '-created_at']
        verbose_name = 'Fee History'
        verbose_name_plural = 'Fee Histories'
        indexes = [
            models.Index(fields=['fee', '-effective_date'], name='idx_fee_effective_date'),
            models.Index(fields=['effective_date'], name='idx_effective_date'),
        ]
        # Prevent duplicate effective dates for the same fee
        unique_together = [['fee', 'effective_date']]

    def __str__(self):
        return f"{self.fee.fee_name} - R{self.rate} (effective {self.effective_date})"


class InspectionEditHistory(models.Model):
    """Audit trail: every time a FoodSafetyAgencyInspection or InspectionGroup is
    edited this table gets one row capturing who changed what and what it was before."""

    OBJECT_CHOICES = [
        ('inspection', 'Inspection'),
        ('group', 'Inspection Group'),
    ]

    object_type    = models.CharField(max_length=20, choices=OBJECT_CHOICES)
    object_id      = models.PositiveIntegerField()

    # Denormalised for fast list display (survives cascade delete of parent)
    inspection_group   = models.ForeignKey(
        'InspectionGroup', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='edit_history',
    )
    client_name        = models.CharField(max_length=200, blank=True, default='')
    date_of_inspection = models.DateField(null=True, blank=True)
    inspector_name     = models.CharField(max_length=100, blank=True, default='')

    edited_by  = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='inspection_edits',
    )
    edited_at    = models.DateTimeField(auto_now_add=True)

    # {field_name: {"label": "Human Label", "old": "...", "new": "..."}}
    changes      = models.JSONField(default=dict)
    change_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'inspection_edit_history'
        ordering = ['-edited_at']
        indexes = [
            models.Index(fields=['inspection_group', '-edited_at'], name='idx_ieh_group_date'),
            models.Index(fields=['edited_by', '-edited_at'],        name='idx_ieh_user_date'),
            models.Index(fields=['-edited_at'],                     name='idx_ieh_date'),
        ]

    def __str__(self):
        return f"{self.client_name} edited by {self.edited_by} at {self.edited_at}"


class Ticket(models.Model):
    """Model for FSA Operations Board tickets/issues"""
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in-progress', 'In Progress'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    # Basic Information
    title = models.CharField(max_length=200, help_text="Ticket title/summary")
    issue_type = models.CharField(max_length=50, blank=True, null=True, help_text="Type of issue (bug, feature, question, etc.)")
    affected_area = models.CharField(max_length=100, blank=True, null=True, help_text="Affected module/area of the system")

    # Description & Details
    description = models.TextField(help_text="Detailed description of the issue")
    steps_to_reproduce = models.TextField(blank=True, null=True, help_text="Steps to reproduce the issue")
    expected_behavior = models.TextField(blank=True, null=True, help_text="What should happen")
    actual_behavior = models.TextField(blank=True, null=True, help_text="What actually happened")

    # Priority & Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open', help_text="Current status of the ticket")
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium', help_text="Priority level")

    # Impact Assessment
    impact_users = models.CharField(max_length=50, blank=True, null=True, help_text="Number of affected users")
    is_blocking = models.CharField(max_length=20, blank=True, null=True, help_text="Is this blocking work?")

    # Additional Information
    browser_info = models.CharField(max_length=200, blank=True, null=True, help_text="Browser/device information")
    additional_notes = models.TextField(blank=True, null=True, help_text="Any other relevant details")

    # Assignment & Dates
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_tickets', help_text="User who created the ticket")
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tickets', help_text="User assigned to handle this ticket")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    due_date = models.DateField(null=True, blank=True, help_text="Target completion date")

    class Meta:
        db_table = 'fsa_tickets'
        ordering = ['-created_at']
        verbose_name = 'Ticket'
        verbose_name_plural = 'Tickets'
        indexes = [
            models.Index(fields=['status'], name='idx_ticket_status'),
            models.Index(fields=['priority'], name='idx_ticket_priority'),
            models.Index(fields=['created_by'], name='idx_ticket_creator'),
            models.Index(fields=['assigned_to'], name='idx_ticket_assignee'),
            models.Index(fields=['-created_at'], name='idx_ticket_created'),
        ]

    def __str__(self):
        return f"#{self.id} - {self.title}"


# =============================================================================
# XERO INTEGRATION MODELS
# =============================================================================
class XeroToken(models.Model):
    """Stores Xero OAuth2 tokens for the connected organisation."""
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField()
    tenant_id = models.CharField(max_length=255, blank=True, default='')
    tenant_name = models.CharField(max_length=255, blank=True, default='')
    token_type = models.CharField(max_length=50, default='Bearer')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Xero Token'

    def __str__(self):
        return f"Xero: {self.tenant_name or 'Unknown'} (expires {self.expires_at})"

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() >= self.expires_at


class XeroInvoice(models.Model):
    """Tracks invoices synced from Xero for aging/outstanding reports."""
    INVOICE_STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('AUTHORISED', 'Authorised'),
        ('PAID', 'Paid'),
        ('VOIDED', 'Voided'),
        ('DELETED', 'Deleted'),
    ]

    xero_invoice_id = models.CharField(max_length=255, unique=True)
    invoice_number = models.CharField(max_length=255, blank=True, default='')
    contact_name = models.CharField(max_length=255, blank=True, default='')
    contact_id = models.CharField(max_length=255, blank=True, default='')
    reference = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, choices=INVOICE_STATUS_CHOICES, default='DRAFT')
    invoice_type = models.CharField(max_length=20, default='ACCREC')  # ACCREC = sales invoice
    currency_code = models.CharField(max_length=10, default='ZAR')
    sub_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    fully_paid_on_date = models.DateField(null=True, blank=True)
    url = models.URLField(max_length=500, blank=True, default='')
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Xero Invoice'
        ordering = ['-due_date']
        indexes = [
            models.Index(fields=['status'], name='idx_xero_inv_status'),
            models.Index(fields=['due_date'], name='idx_xero_inv_due'),
            models.Index(fields=['contact_name'], name='idx_xero_inv_contact'),
        ]

    def __str__(self):
        return f"{self.invoice_number} - {self.contact_name} ({self.status})"

    @property
    def days_outstanding(self):
        if self.status == 'PAID' or not self.due_date:
            return 0
        from datetime import date
        delta = date.today() - self.due_date
        return max(delta.days, 0)

    @property
    def aging_bucket(self):
        days = self.days_outstanding
        if days <= 0:
            return 'Current'
        elif days <= 30:
            return '1-30'
        elif days <= 60:
            return '31-60'
        elif days <= 90:
            return '61-90'
        elif days <= 120:
            return '91-120'
        return '120+'


class InspectorSalary(models.Model):
    """Stores the current monthly salary (CTC) for each inspector."""
    inspector_name = models.CharField(max_length=100, unique=True)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employee_number = models.CharField(max_length=50, blank=True, default='')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inspector_salaries'
        ordering = ['inspector_name']

    def __str__(self):
        return f"{self.inspector_name}: R{self.monthly_salary:,.2f}"


class ClientDropdownOption(models.Model):
    FIELD_CHOICES = [
        ('facility_type', 'Facility Type'),
        ('corporate_group', 'Corporate Group'),
        ('group_type', 'Group Type'),
    ]
    field_type = models.CharField(max_length=50, choices=FIELD_CHOICES)
    value = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('field_type', 'value')
        ordering = ['field_type', 'value']

    def __str__(self):
        return f"{self.field_type}: {self.value}"


class InspectionDocument(models.Model):
    """Tracks each document type uploaded for an inspection as a separate record."""
    DOCUMENT_TYPES = [
        ('rfi', 'RFI'),
        ('invoice', 'Invoice'),
        ('coa', 'COA'),
        ('lab_form', 'Lab Form'),
        ('retest', 'Retest'),
        ('occurrence', 'Occurrence'),
        ('composition', 'Composition'),
        ('compliance', 'Compliance'),
        ('other', 'Other'),
    ]
    inspection = models.ForeignKey(
        FoodSafetyAgencyInspection,
        on_delete=models.CASCADE,
        related_name='documents',
        help_text="The inspection this document belongs to"
    )
    document_type = models.CharField(
        max_length=20,
        choices=DOCUMENT_TYPES,
        db_index=True,
        help_text="Type of document uploaded"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="User who uploaded this document"
    )
    uploaded_date = models.DateTimeField(help_text="When this document was uploaded")

    class Meta:
        db_table = 'inspection_documents'
        unique_together = [['inspection', 'document_type']]
        indexes = [
            models.Index(fields=['document_type']),
            models.Index(fields=['inspection', 'document_type']),
        ]
        ordering = ['-uploaded_date']

    def __str__(self):
        return f"{self.get_document_type_display()} - {self.inspection}"


class SampleDiscrepancy(models.Model):
    """
    Raised by a lab technician when a physical sample was received in the lab but
    the inspector never recorded it in the system ("inspector didn't add the
    sample"). Surfaced in the Inspector KPI report and visible only to
    super admins and lab technicians.
    """
    inspector_name = models.CharField(max_length=100, blank=True, help_text="Inspector who should have recorded the sample")
    client_name = models.CharField(max_length=200, blank=True, help_text="Client / facility")
    date_of_inspection = models.DateField(null=True, blank=True, help_text="Date the inspection was done")
    inspection_group_id = models.CharField(max_length=50, blank=True, db_index=True, help_text="The inspection group (visit) this flag is against")
    commodity = models.CharField(max_length=50, blank=True, help_text="Sample commodity / type")
    note = models.TextField(blank=True, help_text="Lab technician's note")
    reported_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reported_discrepancies")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    rectified = models.BooleanField(default=False, db_index=True)
    rectified_at = models.DateTimeField(null=True, blank=True)
    rectified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="rectified_discrepancies")

    class Meta:
        db_table = "sample_discrepancies"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Missing sample — {self.inspector_name} ({self.client_name})"


class EmailAutomation(models.Model):
    """One automatic email, e.g. 'Management weekly report'.

    Each automation has its own on/off switch, subject, message, signature,
    schedule (daily / weekly on a day / monthly on a date, at a chosen hour),
    recipient list and optional extra attachment. Every send attaches the
    latest completed week's Weekly Report PDF. Placeholders {week}
    {inspections} {compliance} {samples} {km} are filled in at send time.
    """
    SCHEDULE_CHOICES = [
        ("weekly", "Weekly on a day"),
        ("daily", "Every day"),
        ("monthly", "Monthly on a date"),
    ]
    name = models.CharField(max_length=120, help_text="What this email is for, e.g. 'Management weekly report'")
    enabled = models.BooleanField(default=False, help_text="OFF means this email never sends")
    per_inspector = models.BooleanField(
        default=False,
        help_text="Individual report: each recipient gets an email with ONLY their own numbers",
    )
    REPORT_TYPE_CHOICES = [
        ("full", "Full inspector-management report"),
        ("manager", "Manager report (includes financials)"),
        ("finance", "Finance report (no revenue figures)"),
    ]
    report_type = models.CharField(
        max_length=10, choices=REPORT_TYPE_CHOICES, default="full",
        help_text="Which weekly report PDF to attach. Ignored when per_inspector is on.",
    )
    subject = models.CharField(max_length=255, default="Weekly Inspectorate Performance Report — {week}")
    body = models.TextField(default=(
        "Good day,\n\n"
        "Please find attached the Weekly Inspectorate Performance Report for {week}.\n\n"
        "Summary for the week:\n"
        "- Inspections completed: {inspections}\n"
        "- Overall compliance: {compliance}\n"
        "- Samples taken: {samples}\n"
        "- Kilometres travelled: {km}\n\n"
        "This report contains no financial information.\n\n"
        "Regards,\n"
        "APS System"
    ))
    signature = models.TextField(blank=True, default="", help_text="Added to the end of every email from this automation")
    signature_image = models.FileField(upload_to="email_automation_signatures/", blank=True, null=True,
                                       help_text="Optional picture signature shown at the end of the email")
    schedule_type = models.CharField(max_length=10, choices=SCHEDULE_CHOICES, default="weekly")
    send_day_of_week = models.IntegerField(default=0, help_text="0=Monday ... 6=Sunday (weekly schedule)")
    send_day_of_month = models.IntegerField(default=1, help_text="1-28 (monthly schedule)")
    send_hour = models.IntegerField(default=12, help_text="Hour of the day 0-23")
    attachment = models.FileField(upload_to="email_automation_attachments/", blank=True, null=True,
                                  help_text="Optional extra file sent along with the report PDF")
    updated_by = models.CharField(max_length=150, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_automations"
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} ({'ON' if self.enabled else 'OFF'})"


class WeeklyEmailRecipient(models.Model):
    """Who receives a specific automation's email.

    `active=False` keeps the person on the list but stops their emails —
    so someone can be paused without being deleted.
    """
    automation = models.ForeignKey(EmailAutomation, on_delete=models.CASCADE, related_name="recipients", null=True)
    email = models.EmailField()
    name = models.CharField(max_length=150, blank=True, default="")
    active = models.BooleanField(default=True, help_text="Off = stays on the list but gets no emails")
    added_by = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "weekly_email_recipients"
        ordering = ["email"]
        unique_together = [("automation", "email")]

    def __str__(self):
        return f"{self.email} ({'active' if self.active else 'paused'})"


class WeeklyEmailLog(models.Model):
    """One row per send attempt so a failed or missed Monday is visible."""
    STATUS_CHOICES = [
        ("SENT", "Sent"),
        ("FAILED", "Failed"),
        ("SKIPPED_OFF", "Skipped — switch off"),
        ("NO_RECIPIENTS", "Skipped — no active recipients"),
        ("ALREADY_SENT", "Skipped — already sent for this week"),
        ("TEST", "Test send"),
    ]
    automation = models.ForeignKey(EmailAutomation, on_delete=models.SET_NULL, related_name="logs", null=True, blank=True)
    automation_name = models.CharField(max_length=120, blank=True, default="")
    run_at = models.DateTimeField(auto_now_add=True, db_index=True)
    week_start = models.DateField()
    week_end = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, db_index=True)
    recipients = models.TextField(blank=True, default="")
    error = models.TextField(blank=True, default="")
    triggered_by = models.CharField(max_length=150, blank=True, default="schedule")

    class Meta:
        db_table = "weekly_email_log"
        ordering = ["-run_at"]

    def __str__(self):
        return f"{self.run_at:%Y-%m-%d %H:%M} {self.status} ({self.week_start})"


class DeletedInspectionArchive(models.Model):
    """Snapshot of every FoodSafetyAgencyInspection that gets deleted.

    Written by a pre_delete signal, so it captures the record no matter which
    code path removed it (the Next.js edit wizard, the legacy Django edit form,
    the single-inspection delete views, or a whole-group delete).

    Deleting an inspection cascades to InspectionDocument, so the attached
    document rows are captured here too — otherwise the only record that a COA
    or compliance checklist ever existed would vanish with it. The snapshot
    holds every concrete field, which is enough to restore the row later.
    """

    # ---- identity of the deleted record -------------------------------
    original_id          = models.PositiveIntegerField(db_index=True, help_text="Primary key the inspection had")
    remote_id            = models.IntegerField(null=True, blank=True, db_index=True)
    inspection_group_ref = models.PositiveIntegerField(
        null=True, blank=True, db_index=True,
        help_text="Group the inspection belonged to (plain int: survives the group being deleted too)",
    )

    # ---- denormalised for the list view (no joins, survives cascades) --
    client_name        = models.CharField(max_length=200, blank=True, default='', db_index=True)
    commodity          = models.CharField(max_length=50, blank=True, default='', db_index=True)
    product_name       = models.CharField(max_length=200, blank=True, default='')
    date_of_inspection = models.DateField(null=True, blank=True, db_index=True)
    inspector_name     = models.CharField(max_length=100, blank=True, default='')

    # ---- the payload ---------------------------------------------------
    # {field_name: json-safe value} for every concrete field on the model
    snapshot       = models.JSONField(default=dict)
    # [{"document_type": "coa", "uploaded_by": "Ethan", "uploaded_date": "..."}]
    documents      = models.JSONField(default=list)
    document_count = models.PositiveIntegerField(default=0)

    # ---- who / when / where -------------------------------------------
    deleted_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='inspection_deletions',
    )
    deleted_at = models.DateTimeField(auto_now_add=True, db_index=True)
    source     = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Request path the delete came from, e.g. /api/edit-inspection-group/",
    )

    # ---- restore tracking ----------------------------------------------
    restored_at    = models.DateTimeField(null=True, blank=True)
    restored_by    = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='inspection_restores',
    )
    restored_to_id = models.PositiveIntegerField(
        null=True, blank=True, help_text="Primary key of the inspection recreated by the restore",
    )

    class Meta:
        db_table = 'deleted_inspection_archive'
        ordering = ['-deleted_at']
        verbose_name = "Deleted Inspection Archive"
        verbose_name_plural = "Deleted Inspection Archive"
        indexes = [
            models.Index(fields=['-deleted_at'],                name='idx_dia_date'),
            models.Index(fields=['deleted_by', '-deleted_at'],  name='idx_dia_user_date'),
            models.Index(fields=['client_name', '-deleted_at'], name='idx_dia_client_date'),
            models.Index(fields=['original_id'],                name='idx_dia_original'),
        ]

    def __str__(self):
        return f"{self.client_name} ({self.commodity}) deleted by {self.deleted_by} at {self.deleted_at}"

    @property
    def is_restored(self):
        return self.restored_at is not None
